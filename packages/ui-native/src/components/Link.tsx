import { Link as ExpoLink, type LinkProps as ExpoLinkProps } from "expo-router";
import { Text } from "tamagui";

export type LinkProps = ExpoLinkProps & {
  children: string;
};

export function Link({ children, ...rest }: LinkProps) {
  return (
    <ExpoLink {...rest}>
      <Text color="$primary" fontSize="$sm" fontWeight="500">
        {children}
      </Text>
    </ExpoLink>
  );
}
