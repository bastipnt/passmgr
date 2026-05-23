import { Link as ExpoLink, type LinkProps as ExpoLinkProps } from "expo-router";
import { Text } from "tamagui";

export type LinkProps = ExpoLinkProps & {
  children: string;
};

export function Link({ children, ...rest }: LinkProps) {
  return (
    <ExpoLink {...rest}>
      <Text color="$accent10" fontSize="$true" fontWeight="500">
        {children}
      </Text>
    </ExpoLink>
  );
}
