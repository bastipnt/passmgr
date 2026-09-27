import { LockIcon, MailIcon } from "lucide-react";
import preview from "../../.storybook/preview";
import { Button } from "./Button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./Card";
import { Field, FieldError, FieldGroup, FieldLabel, FieldSeparator, FieldWarning } from "./Field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./InputGroup";

const meta = preview.meta({
  title: "Design System/Atoms/Card",
  component: Card,
  subcomponents: {
    CardHeader,
    CardTitle,
    CardDescription,
    CardAction,
    CardContent,
    CardFooter,
  },
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    size: { control: "select", options: ["default", "sm"] },
  },
  args: { size: "default" },
});

export const Default = meta.story({
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Manage your account settings.</CardDescription>
      </CardHeader>
      <CardContent>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</CardContent>
      <CardFooter>
        <Button>Save</Button>
      </CardFooter>
    </Card>
  ),
});

export const WithAction = meta.story({
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>Project</CardTitle>
        <CardDescription>Acme Inc.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>Pinned at top of dashboard.</CardContent>
    </Card>
  ),
});

export const Small = meta.story({
  args: { size: "sm" },
  render: (args) => (
    <Card {...args} className="w-72">
      <CardHeader>
        <CardTitle>Compact card</CardTitle>
      </CardHeader>
      <CardContent>Smaller padding and gaps.</CardContent>
    </Card>
  ),
});

/** The auth-screen card: frosted glass over the color light field. */
export const Glass = meta.story({
  parameters: { layout: "fullscreen" },
  render: () => (
    <div className="relative isolate grid min-h-screen place-items-center p-6">
      <div className="light-field" />
      <Card variant="glass" className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>
            New here?{" "}
            <a href="#register" className="font-medium text-foreground underline">
              Create an account
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="glass-email">Email</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <MailIcon />
                </InputGroupAddon>
                <InputGroupInput id="glass-email" defaultValue="jana.koch@mailbox.org" />
              </InputGroup>
            </Field>
            <Field>
              <FieldLabel htmlFor="glass-password">Password</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <LockIcon />
                </InputGroupAddon>
                <InputGroupInput
                  id="glass-password"
                  type="password"
                  aria-invalid
                  defaultValue="hunter22"
                />
              </InputGroup>
            </Field>
            <FieldError variant="box">
              <strong>That didn&apos;t work.</strong> Check your email and password and try again.
            </FieldError>
            <FieldWarning>
              <strong>Too many login attempts.</strong> Please wait and try again.
            </FieldWarning>
            <Button size="lg">Unlock vault</Button>
            <FieldSeparator>or</FieldSeparator>
            <Button size="lg" variant="outline">
              Unlock with biometrics
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  ),
});
