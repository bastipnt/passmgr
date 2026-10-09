import type { RecordFormValues, RecordType } from "@repo/schema";
import type { Ref } from "react";
import LoginRecordForm from "./login/LoginRecordForm";
import TypedRecordForm, { type OtherRecordType } from "./TypedRecordForm";

export type RecordFormHandle = {
  triggerSubmit: () => void;
};

type RecordFormProps<T extends RecordType> = {
  type: T;
  onSubmit: (data: RecordFormValues<T>) => void;
  serverError?: string;
  /** Locks every field while a save is in flight. */
  disabled?: boolean;
  defaultValues?: Partial<RecordFormValues<T>>;
  ref?: Ref<RecordFormHandle>;
};

// TODO: use TypedRecordForm for all records

/** The create / edit form of a record type: the login's own, or the generic one. */
export default function RecordForm<T extends RecordType>(props: RecordFormProps<T>) {
  if (props.type === "login") {
    const loginProps = props as unknown as RecordFormProps<"login">;
    return <LoginRecordForm {...loginProps} />;
  }
  return <TypedRecordForm {...(props as unknown as RecordFormProps<OtherRecordType>)} />;
}
