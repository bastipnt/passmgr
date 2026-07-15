import { ArrowUpRight } from "lucide-react-native";
import { Link as ExpoLink, type LinkProps as ExpoLinkProps } from "expo-router";
import { Text } from "react-native";
import { useCSSVariable } from "uniwind";

export type LinkProps = Omit<ExpoLinkProps, "href"> & {
  href: string;
  children: string;
  target?: "_blank";
};

export function Link({ children, target, href, ...rest }: LinkProps) {
  const accent = useCSSVariable("--color-primary") as string;

  return (
    <ExpoLink {...rest} href={href as ExpoLinkProps["href"]} target={target}>
      <Text className="text-md font-medium text-primary">
        {children}
        {target === "_blank" ? (
          <>
            {" "}
            <ArrowUpRight size={14} color={accent} />
          </>
        ) : null}
      </Text>
    </ExpoLink>
  );
}
