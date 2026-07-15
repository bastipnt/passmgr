import { createContext, useContext, type ReactNode } from "react";
import { Image, type ImageProps, View, type ViewProps, Text } from "react-native";

import { cn } from "../lib/utils";

type AvatarSize = "default" | "sm" | "lg";

const sizeMap: Record<AvatarSize, number> = {
  default: 32,
  sm: 24,
  lg: 40,
};

const badgeSizeMap: Record<AvatarSize, number> = {
  default: 10,
  sm: 8,
  lg: 12,
};

const fallbackTextClass: Record<AvatarSize, string> = {
  default: "text-lg",
  sm: "text-md",
  lg: "text-lg",
};

const AvatarSizeContext = createContext<AvatarSize>("default");

export function Avatar({
  size = "default",
  className,
  style,
  children,
  ...props
}: ViewProps & { size?: AvatarSize; className?: string }) {
  const dimension = sizeMap[size];
  return (
    <AvatarSizeContext.Provider value={size}>
      <View
        className={cn("items-center justify-center overflow-hidden rounded-full", className)}
        style={[{ width: dimension, height: dimension }, style]}
        {...props}
      >
        {children}
      </View>
    </AvatarSizeContext.Provider>
  );
}

export function AvatarImage({
  src,
  className,
  ...props
}: Omit<ImageProps, "source"> & { src?: string; className?: string }) {
  if (!src) return null;
  return (
    <Image
      accessibilityRole="image"
      source={{ uri: src }}
      className={cn("h-full w-full", className)}
      {...props}
    />
  );
}

export function AvatarFallback({
  children,
  className,
  ...props
}: ViewProps & { className?: string; children?: ReactNode }) {
  const size = useContext(AvatarSizeContext);
  return (
    <View
      className={cn("h-full w-full items-center justify-center bg-muted", className)}
      {...props}
    >
      {typeof children === "string" ? (
        <Text className={cn("text-muted-foreground", fallbackTextClass[size])}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

export function AvatarBadge({
  children,
  className,
  style,
  ...props
}: ViewProps & { className?: string }) {
  const size = useContext(AvatarSizeContext);
  const dimension = badgeSizeMap[size];
  return (
    <View
      className={cn(
        "absolute bottom-0 right-0 z-10 items-center justify-center rounded-full border-2 border-background bg-primary",
        className,
      )}
      style={[{ width: dimension, height: dimension }, style]}
      {...props}
    >
      {children}
    </View>
  );
}

export function AvatarGroup({
  size = "default",
  className,
  children,
  ...props
}: ViewProps & { size?: AvatarSize; className?: string }) {
  return (
    <AvatarSizeContext.Provider value={size}>
      <View className={cn("flex-row items-center", className)} {...props}>
        {children}
      </View>
    </AvatarSizeContext.Provider>
  );
}

export function AvatarGroupCount({
  children,
  className,
  style,
  ...props
}: ViewProps & { className?: string; children: ReactNode }) {
  const size = useContext(AvatarSizeContext);
  const dimension = sizeMap[size];
  return (
    <View
      className={cn(
        "-ml-2 items-center justify-center rounded-full border-2 border-background bg-muted",
        className,
      )}
      style={[{ width: dimension, height: dimension }, style]}
      {...props}
    >
      <Text className={cn("text-muted-foreground", fallbackTextClass[size])}>{children}</Text>
    </View>
  );
}
