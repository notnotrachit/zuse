import { ArchiveIcon, PinIcon, PinOffIcon } from "@zuse/icons/solid-rounded";
import { Link } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	runOnJS,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withSpring,
	withTiming,
} from "react-native-reanimated";

import { DitherCloudIcon } from "~/components/dither-cloud-icon";
import { ProviderLogo } from "~/components/provider-logo";
import { HugeIcon } from "~/components/ui/huge-icon";
import { cn } from "~/lib/cn";
import type { HomeFeedItem } from "~/lib/home-feed";
import { colors } from "~/theme";

type ChatItem = HomeFeedItem & { type: "chat" };

const ACTION_WIDTH = 84;
const OPEN_DISTANCE = ACTION_WIDTH * 0.34;
const OPEN_SPRING = {
	damping: 28,
	stiffness: 420,
	mass: 0.5,
	overshootClamping: true,
} as const;

const closers = new Set<() => void>();

export function closeOpenChatSwipes() {
	for (const close of closers) close();
}

const rubberBand = (value: number, min: number, max: number) => {
	"worklet";
	if (value < min) return min + (value - min) * 0.2;
	if (value > max) return max + (value - max) * 0.2;
	return value;
};

function HomeChatRowInner({
	item,
	onArchive,
	onTogglePin,
	swipeEnabled = true,
}: {
	item: ChatItem;
	onArchive: (item: ChatItem) => Promise<void>;
	onTogglePin: (item: ChatItem) => void;
	swipeEnabled?: boolean;
}) {
	const row = item.row;
	const isActive = row.status === "running" || row.status === "booting";
	const canPin = row.chat !== null;
	const reduceMotion = useReducedMotion();
	const translateX = useSharedValue(0);
	const grabX = useSharedValue(0);
	const touchOriginX = useSharedValue(0);
	const touchOriginY = useSharedValue(0);
	const decided = useSharedValue(false);
	const armed = useSharedValue(false);
	const activated = useSharedValue(false);
	const ended = useSharedValue(false);
	const canPinValue = useSharedValue(canPin ? 1 : 0);
	const [opened, setOpened] = useState(false);
	const engaged = useRef(false);
	const engagement = useRef(0);
	const href =
		row.session === null
			? {
					pathname: "/new-chat" as const,
					params: { conn: row.connectionKey, chatId: row.chat?.id },
				}
			: (`/c/${encodeURIComponent(row.connectionKey)}/session/${encodeURIComponent(
					row.session.id,
				)}` as const);

	useEffect(() => {
		canPinValue.value = canPin ? 1 : 0;
	}, [canPin, canPinValue]);

	const publishOpen = useCallback((next: boolean) => {
		setOpened((current) => (current === next ? current : next));
	}, []);

	const markEngaged = useCallback(() => {
		engagement.current += 1;
		engaged.current = true;
	}, []);

	const clearEngagedSoon = useCallback(() => {
		const token = engagement.current;
		setTimeout(() => {
			if (engagement.current === token) engaged.current = false;
		}, 160);
	}, []);

	const close = useCallback(() => {
		translateX.value = reduceMotion
			? withTiming(0, { duration: 0 })
			: withSpring(0, OPEN_SPRING);
		publishOpen(false);
	}, [publishOpen, reduceMotion, translateX]);

	useEffect(() => {
		closers.add(close);
		return () => {
			closers.delete(close);
		};
	}, [close]);

	const closeOthers = useCallback(() => {
		for (const other of closers) {
			if (other !== close) other();
		}
	}, [close]);

	const pan = useMemo(
		() =>
			Gesture.Pan()
				.enabled(swipeEnabled)
				.manualActivation(true)
				.onTouchesDown((event) => {
					const touch = event.allTouches[0];
					if (touch === undefined) return;
					touchOriginX.value = touch.absoluteX;
					touchOriginY.value = touch.absoluteY;
					decided.value = false;
					armed.value = false;
				})
				.onTouchesMove((event, state) => {
					if (decided.value) return;
					const touch = event.allTouches[0];
					if (touch === undefined) return;
					const dx = touch.absoluteX - touchOriginX.value;
					const dy = touch.absoluteY - touchOriginY.value;
					// A vertical list scroll must win immediately. A mostly
					// horizontal move claims the gesture, including a slight arc.
					if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
						decided.value = true;
						state.fail();
						return;
					}
					if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
						decided.value = true;
						state.activate();
					}
				})
				.onStart(() => {
					activated.value = true;
					ended.value = false;
					runOnJS(markEngaged)();
					runOnJS(closeOthers)();
				})
				.onUpdate((event) => {
					const dx = event.absoluteX - touchOriginX.value;
					if (!armed.value) {
						armed.value = true;
						grabX.value = translateX.value - dx;
					}
					const max = canPinValue.value === 1 ? ACTION_WIDTH : 0;
					translateX.value = rubberBand(grabX.value + dx, -ACTION_WIDTH, max);
				})
				.onEnd((event) => {
					ended.value = true;
					const projected = translateX.value + event.velocityX * 0.2;
					const openPin = canPinValue.value === 1 && projected > OPEN_DISTANCE;
					const openArchive = projected < -OPEN_DISTANCE;
					const to = openPin ? ACTION_WIDTH : openArchive ? -ACTION_WIDTH : 0;
					runOnJS(publishOpen)(to !== 0);
					translateX.value = reduceMotion
						? withTiming(to, { duration: 0 })
						: withSpring(to, { ...OPEN_SPRING, velocity: event.velocityX });
				})
				.onFinalize(() => {
					if (!activated.value) return;
					if (!ended.value) {
						const projected = translateX.value;
						const openPin =
							canPinValue.value === 1 && projected > OPEN_DISTANCE;
						const openArchive = projected < -OPEN_DISTANCE;
						const to = openPin ? ACTION_WIDTH : openArchive ? -ACTION_WIDTH : 0;
						runOnJS(publishOpen)(to !== 0);
						translateX.value = reduceMotion
							? withTiming(to, { duration: 0 })
							: withSpring(to, OPEN_SPRING);
					}
					activated.value = false;
					ended.value = false;
					armed.value = false;
					runOnJS(clearEngagedSoon)();
				}),
		[
			activated,
			armed,
			canPinValue,
			clearEngagedSoon,
			closeOthers,
			decided,
			ended,
			grabX,
			markEngaged,
			publishOpen,
			reduceMotion,
			swipeEnabled,
			touchOriginX,
			touchOriginY,
			translateX,
		],
	);

	const rowStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: translateX.value }],
	}));

	return (
		<View
			className="overflow-hidden rounded-xl"
			style={item.nested ? { marginLeft: 12 } : undefined}
		>
			{canPin ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={row.pinned ? "Unpin chat" : "Pin chat"}
					onPress={() => {
						close();
						onTogglePin(item);
					}}
					className="absolute bottom-0 left-0 top-0 items-center justify-center bg-muted"
					style={{ width: ACTION_WIDTH }}
				>
					<HugeIcon
						icon={row.pinned ? PinOffIcon : PinIcon}
						size={20}
						color={colors.secondaryFg}
					/>
					<Text className="mt-1 font-sans-medium text-[12px] text-muted-foreground">
						{row.pinned ? "Unpin" : "Pin"}
					</Text>
				</Pressable>
			) : null}
			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Archive chat"
				onPress={() => {
					close();
					void onArchive(item);
				}}
				className="absolute bottom-0 right-0 top-0 items-center justify-center bg-danger/15"
				style={{ width: ACTION_WIDTH }}
			>
				<HugeIcon icon={ArchiveIcon} size={20} color={colors.danger} />
				<Text className="mt-1 font-sans-medium text-[12px] text-danger">
					Archive
				</Text>
			</Pressable>
			<GestureDetector gesture={pan}>
				<Animated.View
					collapsable={false}
					className="bg-background"
					style={rowStyle}
				>
					<Link href={href} asChild>
						<Link.Trigger>
							<Pressable
								accessibilityLabel={`${row.title}, ${row.projectName}`}
								onPress={(event) => {
									// The finger-up that finishes a swipe also hits this
									// press. Block the navigation, but let the gesture decide
									// whether the actions stay open. A later tap closes them.
									const swiped =
										engaged.current || Math.abs(translateX.value) > 0.5;
									if (!swiped && !opened) return;
									event.preventDefault();
									if (opened && !swiped) close();
								}}
								className="min-h-[46px] justify-center rounded-xl px-3 py-2 active:bg-muted"
							>
								<View className="flex-row items-center gap-2.5">
									<View
										className="h-5 w-5 items-center justify-center"
										style={{ marginTop: 2 }}
									>
										{row.connectionKey.startsWith("cloud:") ? (
											<DitherCloudIcon />
										) : (
											<ProviderLogo
												providerId={row.session?.providerId ?? "codex"}
												size={17}
												color={colors.secondaryFg}
											/>
										)}
										{isActive || row.unread ? (
											<View className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
										) : null}
									</View>
									<Text
										className={cn(
											"min-w-0 flex-1 font-sans text-[16px] leading-5",
											row.unread ? "text-foreground" : "text-foreground/90",
										)}
										numberOfLines={1}
									>
										{row.title}
									</Text>
									{item.showProject ? (
										<Text
											numberOfLines={1}
											style={{ maxWidth: "28%" }}
											className="rounded-full bg-muted px-2 py-0.5 font-sans text-[11px] text-muted-foreground"
										>
											{row.projectName}
										</Text>
									) : null}
									<Text
										className="font-sans text-[12px] text-muted-foreground"
										style={{ fontVariant: ["tabular-nums"] }}
									>
										{row.subtitle}
									</Text>
								</View>
							</Pressable>
						</Link.Trigger>
					</Link>
					{opened ? (
						<Pressable
							accessibilityRole="button"
							accessibilityLabel="Close chat actions"
							onPress={close}
							className="absolute inset-0"
						/>
					) : null}
				</Animated.View>
			</GestureDetector>
		</View>
	);
}

export const HomeChatRow = memo(HomeChatRowInner, (prev, next) => {
	const a = prev.item;
	const b = next.item;
	return (
		prev.swipeEnabled === next.swipeEnabled &&
		prev.onArchive === next.onArchive &&
		prev.onTogglePin === next.onTogglePin &&
		a.key === b.key &&
		a.nested === b.nested &&
		a.showProject === b.showProject &&
		a.row.title === b.row.title &&
		a.row.subtitle === b.row.subtitle &&
		a.row.pinned === b.row.pinned &&
		a.row.unread === b.row.unread &&
		a.row.status === b.row.status &&
		a.row.projectName === b.row.projectName &&
		a.row.connectionKey === b.row.connectionKey &&
		a.row.session?.id === b.row.session?.id &&
		a.row.chat?.id === b.row.chat?.id
	);
});
