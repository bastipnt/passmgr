import { type ReactNode } from "react";
import { Platform, Pressable, type PressableProps, Text } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import {
  Button as SwiftUIButton,
  Host,
  HStack,
  ProgressView,
  Text as SwiftUIText,
  type ButtonProps as SwiftUIButtonProps,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel as accessibilityLabelModifier,
  buttonStyle,
  controlSize,
  disabled as disabledModifier,
  foregroundStyle,
  frame,
  imageScale,
  labelStyle,
  progressViewStyle,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useCSSVariable, withUniwind } from "uniwind";

import { cn } from "../lib/utils";
import { Spinner } from "./Spinner";

const buttonVariants = cva(
  "flex-row shrink-0 items-center justify-center gap-sm rounded-lg border border-transparent px-[10px]",
  {
    variants: {
      variant: {
        default: "bg-primary",
        outline: "border-border bg-background",
        secondary: "bg-secondary",
        ghost: "bg-transparent",
        "ghost-destructive": "bg-transparent",
        destructive: "bg-destructive/20",
        link: "bg-transparent",
        glass: "bg-muted/80 border-border",
        "glass-primary": "bg-muted/80 border-border",
      },
      size: {
        sm: "h-[32px]",
        default: "h-[40px]",
        lg: "h-[52px]",
        icon: "h-[40px] w-[40px] px-0",
        "icon-lg": "h-[52px] w-[52px] px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const buttonTextVariants = cva("text-sm font-semibold", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      outline: "text-foreground",
      secondary: "text-secondary-foreground",
      ghost: "text-foreground",
      "ghost-destructive": "text-destructive",
      destructive: "text-destructive",
      link: "text-primary underline",
      glass: "text-foreground",
      "glass-primary": "text-primary",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

/** Spinner tint for the pressable fallback — mirrors `buttonTextVariants`. */
const spinnerColorClasses = {
  default: "text-primary-foreground",
  outline: "text-foreground",
  secondary: "text-secondary-foreground",
  ghost: "text-foreground",
  "ghost-destructive": "text-destructive",
  destructive: "text-destructive",
  link: "text-primary",
  glass: "text-foreground",
  "glass-primary": "text-primary",
} as const satisfies Record<ButtonVariant, string>;

/**
 * The SwiftUI button lives inside a `Host`, which is an ordinary RN view to
 * yoga: it only carries the box (height, and width for the icon sizes). Colors
 * and padding come from the native button style, so none of the paint classes
 * from `buttonVariants` apply here.
 */
const nativeHostVariants = cva("shrink-0", {
  variants: {
    size: {
      sm: "h-[32px]",
      default: "h-[40px]",
      lg: "h-[52px]",
      icon: "h-[40px] w-[40px]",
      "icon-lg": "h-[52px] w-[52px]",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

type SFSymbolName = NonNullable<SwiftUIButtonProps["systemImage"]>;
type ButtonVariant = NonNullable<NonNullable<VariantProps<typeof buttonVariants>["variant"]>>;
type ButtonSize = NonNullable<NonNullable<VariantProps<typeof buttonVariants>["size"]>>;

/**
 * How each web-ish variant maps onto SwiftUI's button styles. `role`
 * destructive already reddens the label; the tint keeps the fill on our token
 * rather than the system accent.
 */
type NativeVariantSpec = {
  style: "borderedProminent" | "bordered" | "plain" | "glass";
  role?: "destructive";
  tintVariable: string;
  /**
   * Color of the label content. Only the prominent style paints its own
   * contrasting label, so every other variant just reuses the tint.
   */
  contentVariable?: string;
};

const nativeVariants: Record<ButtonVariant, NativeVariantSpec> = {
  default: {
    style: "borderedProminent",
    tintVariable: "--color-primary",
    contentVariable: "--color-primary-foreground",
  },
  outline: { style: "bordered", tintVariable: "--color-foreground" },
  secondary: { style: "bordered", tintVariable: "--color-secondary-foreground" },
  ghost: { style: "plain", tintVariable: "--color-foreground" },
  "ghost-destructive": { style: "plain", role: "destructive", tintVariable: "--color-destructive" },
  destructive: { style: "bordered", role: "destructive", tintVariable: "--color-destructive" },
  link: { style: "plain", tintVariable: "--color-primary" },
  /**
   * Liquid glass, the same material the native tab bar uses. `glass` needs
   * iOS 26; SwiftUI falls back to the plain style on older versions, and
   * non-iOS falls back to the pressable's translucent fill.
   */
  glass: { style: "glass", tintVariable: "--color-foreground" },
  "glass-primary": { style: "glass", tintVariable: "--color-primary" },
};

const nativeControlSizes = {
  sm: "small",
  default: "regular",
  lg: "large",
  icon: "regular",
  "icon-lg": "large",
} as const satisfies Record<ButtonSize, "small" | "regular" | "large">;

const nativeImageScales = {
  sm: "small",
  default: "medium",
  lg: "large",
  icon: "medium",
  "icon-lg": "large",
} as const satisfies Record<ButtonSize, "small" | "medium" | "large">;

/**
 * `.infinity` cannot cross the bridge (JSON has no such number), so a value
 * larger than any phone gets the same effect: SwiftUI clamps `maxWidth` to the
 * size the host proposes.
 */
const FILL = 10_000;

const NativeHost = withUniwind(Host);

export type ButtonProps = Omit<PressableProps, "children"> &
  VariantProps<typeof buttonVariants> & {
    className?: string;
    /** Extra classes for the auto-wrapped text child. */
    textClassName?: string;
    /** Leading node (icon / spinner) rendered before the label. */
    icon?: ReactNode;
    /**
     * Swaps the leading icon for a spinner and disables the button. Prefer this
     * over passing a spinner as `icon`: the native iOS button can only lay out
     * SwiftUI children, so an RN spinner would drop it back to the pressable.
     */
    loading?: boolean;
    children?: ReactNode;
    /**
     * iOS only: SF Symbol drawn by the native button. Required for icon-only
     * native buttons — an RN `icon` node cannot be rendered inside SwiftUI.
     */
    systemImage?: SFSymbolName;
    /**
     * iOS only: size the native button to its label instead of filling the
     * space its parent gives it. Needed inside `flex-row` parents, where the
     * host has no intrinsic width of its own.
     */
    hug?: boolean;
    /**
     * Opt out of the native iOS button and always render the RN pressable.
     * Required inside a `FullWindowOverlay`: its container hangs off the
     * `UIWindow`, so the SwiftUI host finds no parent view controller and
     * never mounts its content.
     */
    native?: boolean;
  };

export function Button({
  className,
  textClassName,
  variant = "default",
  size = "default",
  icon,
  loading = false,
  children,
  disabled,
  systemImage,
  hug = false,
  native = true,
  ...props
}: ButtonProps) {
  const nativeVariant = nativeVariants[variant ?? "default"];
  const tintColor = useCSSVariable(nativeVariant.tintVariable) as string;
  const contentColor = useCSSVariable(nativeVariant.contentVariable ?? nativeVariant.tintVariable);

  const isDisabled = disabled || loading;

  /*
   * SwiftUI can only lay out its own children, so anything carrying RN nodes
   * (an `icon` spinner, a `<Text>` child) falls back to the pressable.
   */
  const label = typeof children === "string" ? children : undefined;
  const iconOnly = children == null && systemImage != null;
  const useNativeButton =
    Platform.OS === "ios" && native && icon == null && (label != null || iconOnly);

  if (useNativeButton) {
    const { onPress, accessibilityLabel } = props;

    /*
     * While loading the label is built from SwiftUI views instead of the
     * `label` prop, so the spinner stays inside the native button rather than
     * knocking it back to the pressable. The spinner has to be tinted
     * explicitly: the prominent style paints its label white, but a nested
     * ProgressView follows the button tint and would vanish into the fill.
     */
    const spinner = (
      <ProgressView modifiers={[progressViewStyle("circular"), tint(contentColor as string)]} />
    );

    /*
     * A `frame` on the button itself only widens the tap target: the button
     * style still sizes its fill to the label and centers it. Stretching has to
     * happen *inside* the label, which means building it from SwiftUI views
     * instead of the `label` prop. Only the `hug` sizes keep the plain prop —
     * they are meant to shrink to their content.
     */
    // A `systemImage` next to text keeps the prop pair: SwiftUI's `Label` pairs
    // symbol and title for us, and no call site needs that combo stretched.
    const fillLabel = !hug && label != null && systemImage == null;
    const labelContent =
      loading || fillLabel ? (
        <HStack spacing={6} modifiers={fillLabel ? [frame({ maxWidth: FILL })] : []}>
          {loading ? spinner : null}
          {label != null ? (
            <SwiftUIText modifiers={[foregroundStyle(contentColor as string)]}>{label}</SwiftUIText>
          ) : null}
        </HStack>
      ) : undefined;

    return (
      <NativeHost
        matchContents={{ horizontal: hug }}
        className={cn(nativeHostVariants({ size }), className)}
      >
        <SwiftUIButton
          label={labelContent ? undefined : (label ?? "")}
          systemImage={labelContent ? undefined : systemImage}
          role={nativeVariant.role}
          // The native button reports no gesture event; no call site reads one.
          onPress={() => onPress?.(undefined as never)}
          modifiers={[
            buttonStyle(nativeVariant.style),
            controlSize(nativeControlSizes[size ?? "default"]),
            tint(tintColor),
            frame({ maxWidth: FILL, maxHeight: FILL }),
            // The SF Symbol tracks the label font, so the bigger sizes need it
            // scaled up explicitly to fill their box.
            ...(iconOnly && !loading
              ? [labelStyle("iconOnly"), imageScale(nativeImageScales[size ?? "default"])]
              : []),
            ...(isDisabled ? [disabledModifier(true)] : []),
            ...(accessibilityLabel ? [accessibilityLabelModifier(accessibilityLabel)] : []),
          ]}
        >
          {labelContent}
        </SwiftUIButton>
      </NativeHost>
    );
  }

  return (
    <Pressable
      className={cn(buttonVariants({ variant, size }), isDisabled && "opacity-50", className)}
      disabled={isDisabled}
      style={({ pressed }) => (pressed && !isDisabled ? { opacity: 0.85 } : null)}
      accessibilityRole="button"
      {...props}
    >
      {loading ? <Spinner colorClassName={spinnerColorClasses[variant ?? "default"]} /> : icon}
      {typeof children === "string" ? (
        <Text className={cn(buttonTextVariants({ variant }), textClassName)}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

export { buttonVariants, buttonTextVariants };
