import type { ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";

import { selectionTap } from "~/lib/haptics";

export function ProjectDragRow({
	children,
	enabled,
	register,
	onStart,
	onDrop,
	onFinish,
}: {
	children: ReactNode;
	enabled: boolean;
	register: (view: View | null) => void;
	onStart: () => void;
	onDrop: (screenY: number) => void;
	onFinish: () => void;
}) {
	const translateY = useSharedValue(0);
	const dragging = useSharedValue(false);
	const [lifted, setLifted] = useState(false);
	const onStartRef = useRef(onStart);
	const onDropRef = useRef(onDrop);
	const onFinishRef = useRef(onFinish);
	onStartRef.current = onStart;
	onDropRef.current = onDrop;
	onFinishRef.current = onFinish;

	const begin = useCallback(() => {
		setLifted(true);
		selectionTap();
		onStartRef.current();
	}, []);
	const drop = useCallback((screenY: number) => {
		onDropRef.current(screenY);
	}, []);
	const finish = useCallback(() => {
		setLifted(false);
		onFinishRef.current();
	}, []);

	const pan = useMemo(() => {
		// Native is simultaneous so the row's Pressable still receives taps.
		// activeOffset would raise minDist and cancel the long-press on the
		// same movement that was supposed to start the drag.
		const drag = Gesture.Pan()
			.enabled(enabled)
			.activateAfterLongPress(350)
			.onStart(() => {
				dragging.value = true;
				runOnJS(begin)();
			})
			.onUpdate((event) => {
				translateY.value = event.translationY;
			})
			.onEnd((event) => {
				runOnJS(drop)(event.absoluteY);
			})
			.onFinalize(() => {
				if (!dragging.value) return;
				translateY.value = withTiming(0, { duration: 160 });
				dragging.value = false;
				runOnJS(finish)();
			});
		return Gesture.Simultaneous(drag, Gesture.Native());
	}, [begin, dragging, drop, enabled, finish, translateY]);

	const style = useAnimatedStyle(() => ({
		zIndex: dragging.value ? 2 : 0,
		opacity: dragging.value ? 0.92 : 1,
		transform: [
			{ translateY: translateY.value },
			{ scale: dragging.value ? 1.015 : 1 },
		],
	}));

	return (
		<View ref={register} collapsable={false}>
			<GestureDetector gesture={pan}>
				<Animated.View
					style={[
						{
							borderRadius: 12,
							borderCurve: "continuous",
							overflow: "hidden",
						},
						style,
					]}
					className={lifted ? "bg-muted" : undefined}
				>
					{children}
				</Animated.View>
			</GestureDetector>
		</View>
	);
}
