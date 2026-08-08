import { Loader2 } from "lucide-react";
import type React from "react";
import { cn } from "~/lib/utils";

export function Spinner({
	className,
	...props
}: React.SVGProps<SVGSVGElement>): React.ReactElement {
	return (
		<Loader2
			aria-label="Loading"
			className={cn("animate-spin", className)}
			role="status"
			{...props}
		/>
	);
}
