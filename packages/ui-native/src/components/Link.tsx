import { ArrowUpRight } from "@tamagui/lucide-icons-2";
import { Link as ExpoLink, type LinkProps as ExpoLinkProps } from "expo-router";
import { ReactNode } from "react";
import { Anchor, AnchorProps, Text } from "tamagui";

type ExternalLinkProps = AnchorProps & {
  children: string;
  target: "_blank";
};

type InternalLinkProps = ExpoLinkProps & {
  children: string;
  target?: undefined;
};

export type LinkProps = ExternalLinkProps | InternalLinkProps;

function LinkText({ children }: { children: ReactNode }) {
  return (
    <Text color="$accent3" fontSize="$true" fontWeight="500">
      {children}
    </Text>
  );
}

export function Link(props: LinkProps) {
  if (props.target === "_blank") {
    const { children, ...rest } = props;

    return (
      <Anchor {...rest} target="_blank" rel="noopener noreferrer">
        <LinkText>
          {children} <ArrowUpRight size="$1" color="$accent3" />
        </LinkText>
      </Anchor>
    );
  }

  const { children, ...rest } = props;
  return (
    <ExpoLink {...rest}>
      <LinkText>{children}</LinkText>
    </ExpoLink>
  );
}
