import { Link as ExpoLink, type LinkProps as ExpoLinkProps } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { colors, fontSize } from "../theme/tokens";

export type LinkProps = ExpoLinkProps & {
  children: string;
};

export function Link({ children, style, ...rest }: LinkProps) {
  return (
    <ExpoLink {...rest} style={style}>
      <Text style={styles.text}>{children}</Text>
    </ExpoLink>
  );
}

const styles = StyleSheet.create({
  text: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: "500",
  },
});
