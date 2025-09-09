"use client";
import { cva } from "class-variance-authority";
import clsx from "clsx";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import type { ButtonHTMLAttributes } from "react";
import { Button } from "./ui/button";

const buttonVariants = cva(
	"size-7 w-4 h-4 text-fd-muted-foreground group-hover:text-fd-accent-foreground transition-colors",
	{
		variants: {
			dark: {
				true: "hidden dark:block",
				false: "block dark:hidden",
			},
		},
	},
);

export function ThemeToggle({
	className,
	...props
}: ButtonHTMLAttributes<HTMLButtonElement>): React.ReactElement {
	const { setTheme, resolvedTheme, theme } = useTheme();

	const onToggle = (): void => {
		setTheme(resolvedTheme === "dark" ? "light" : "dark");
	};

	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-sm"
			className={clsx("group inline-flex items-center", className)}
			data-theme-toggle=""
			aria-label="Toggle Theme"
			onClick={onToggle}
			{...props}
		>
			<Sun className={clsx(buttonVariants({ dark: false }))} />
			<Moon className={clsx(buttonVariants({ dark: true }))} />
		</Button>
	);
}
