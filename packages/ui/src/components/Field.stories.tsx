import preview from "../../.storybook/preview";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "./Field";
import { Input } from "./Input";
import { Switch } from "./Switch";

const meta = preview.meta({
  title: "Design System/Atoms/Field",
  component: FieldSet,
  subcomponents: {
    FieldLegend,
    FieldDescription,
    FieldGroup,
    Field,
    FieldLabel,
    Input,
    FieldError,
    Switch,
  },
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {},
});

export const Default = meta.story({
  render: (args) => (
    <FieldSet {...args}>
      <FieldLegend>Profile</FieldLegend>
      <FieldDescription>This appears on invoices and emails.</FieldDescription>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Full name</FieldLabel>
          <Input id="name" autoComplete="off" placeholder="Evil Rabbit" />
          <FieldDescription>This appears on invoices and emails.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="username">Username</FieldLabel>
          <Input id="username" autoComplete="off" aria-invalid />
          <FieldError>Choose another username.</FieldError>
        </Field>
        <Field orientation="horizontal">
          <Switch id="newsletter" className="bg-black" />
          <FieldLabel htmlFor="newsletter">Subscribe to the newsletter</FieldLabel>
        </Field>
      </FieldGroup>
    </FieldSet>
  ),
});
