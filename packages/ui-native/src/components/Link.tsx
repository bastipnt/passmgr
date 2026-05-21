import { Link as ExpoLink, type LinkProps as ExpoLinkProps } from "expo-router";
import { Text } from "../lib/styled";

export type LinkProps = ExpoLinkProps & {
  children: string;
};

export function Link({ children, ...rest }: LinkProps) {
  return (
    <ExpoLink {...rest}>
      <Text className="text-primary text-sm font-medium">{children}</Text>
    </ExpoLink>
  );
}
