import { createContext, useContext, type ReactNode } from "react";
import {
  Avatar as AvatarPrimitive,
  type AvatarProps,
  type FontSizeTokens,
  Text,
  XStack,
  YStack,
  type YStackProps,
} from "tamagui";

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

const fallbackFontMap: Record<AvatarSize, FontSizeTokens> = {
  default: "$sm",
  sm: "$xs",
  lg: "$sm",
};

// Web uses `group-data-[size]` CSS selectors so children can scale to the avatar
// size. Native has no such selectors, so we thread the size through context.
const AvatarSizeContext = createContext<AvatarSize>("default");

export function Avatar({
  size = "default",
  ...props
}: Omit<AvatarProps, "size"> & { size?: AvatarSize }) {
  const dimension = sizeMap[size];
  return (
    <AvatarSizeContext.Provider value={size}>
      <AvatarPrimitive circular width={dimension} height={dimension} {...props} />
    </AvatarSizeContext.Provider>
  );
}

export function AvatarImage(props: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return <AvatarPrimitive.Image accessibilityRole="image" {...props} />;
}

export function AvatarFallback({
  children,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  const size = useContext(AvatarSizeContext);
  return (
    <AvatarPrimitive.Fallback bg="$color3" items="center" justify="center" {...props}>
      {typeof children === "string" ? (
        <Text fontSize={fallbackFontMap[size]} color="$color11">
          {children}
        </Text>
      ) : (
        children
      )}
    </AvatarPrimitive.Fallback>
  );
}

export function AvatarBadge({ children, ...props }: YStackProps) {
  const size = useContext(AvatarSizeContext);
  const dimension = badgeSizeMap[size];
  return (
    <YStack
      position="absolute"
      r={0}
      b={0}
      z={10}
      width={dimension}
      height={dimension}
      rounded={9999}
      items="center"
      justify="center"
      bg="$accent9"
      borderWidth={2}
      borderColor="$background"
      {...props}
    >
      {children}
    </YStack>
  );
}

export function AvatarGroup({
  size = "default",
  children,
  ...props
}: YStackProps & { size?: AvatarSize }) {
  return (
    <AvatarSizeContext.Provider value={size}>
      <XStack items="center" {...props}>
        {children}
      </XStack>
    </AvatarSizeContext.Provider>
  );
}

export function AvatarGroupCount({ children, ...props }: YStackProps & { children: ReactNode }) {
  const size = useContext(AvatarSizeContext);
  const dimension = sizeMap[size];
  return (
    <YStack
      width={dimension}
      height={dimension}
      ml={-8}
      rounded={9999}
      items="center"
      justify="center"
      bg="$color3"
      borderWidth={2}
      borderColor="$background"
      {...props}
    >
      <Text fontSize={fallbackFontMap[size]} color="$color11">
        {children}
      </Text>
    </YStack>
  );
}
