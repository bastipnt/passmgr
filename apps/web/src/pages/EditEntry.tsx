import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useTRPC } from "../utils/trpc";
import { Suspense } from "react";
import { Toast } from "../components/Toast";
import { TiCancel, TiUpload } from "react-icons/ti";
import { Button } from "../components/Button";
import { useLocation, useParams } from "wouter";
import { entrySlug } from "../data/routes";
import ButtonLink from "../components/ButtonLink";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { entrySchema } from "@repo/client";
import { z } from "zod";
import LayoutOverlay from "../layout/LayoutOverlay";
import Input from "../components/Input";

function Fallback() {
  return (
    <div className="space-y-4 p-2">
      <h1>Loading...</h1>
    </div>
  );
}

type FormValues = z.infer<typeof entrySchema>;

type EditEntryListProps = {
  entryId: string;
};

function EditEntryChild({ entryId }: EditEntryListProps) {
  const trpc = useTRPC();
  const [_, navigate] = useLocation();
  const { data: initialData } = useSuspenseQuery(trpc.entry.getById.queryOptions(entryId));
  const { mutate, error: mutationError } = useMutation(
    trpc.entry.update.mutationOptions({
      onSuccess: () => {
        navigate(entryUrl);
      },
    }),
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: { ...initialData, id: entryId },
  });

  const entryUrl = `/${entrySlug}/${entryId}`;

  const onSubmit = (data: FormValues) => {
    mutate(data);
  };

  return (
    <LayoutOverlay title={`Edit ${initialData.title}`}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input label="Title" {...register("title")} error={errors.title?.message} />

        <Input
          label="Username / Email"
          {...register("username")}
          error={errors.username?.message}
        />

        <Input label="Password" {...register("password")} error={errors.password?.message} />

        <Input label="2FA secret key (TOTP)" {...register("totp")} error={errors.totp?.message} />

        <Input
          label="Websites (TODO: array)"
          {...register("websites")}
          error={errors.websites?.message}
        />

        <Input label="Note (TODO: textarea)" {...register("note")} error={errors.note?.message} />

        <Input
          label="Extra fields (TODO: array)"
          {...register("extraFields")}
          error={errors.extraFields?.message}
        />

        {mutationError && <p className="text-red-500">{mutationError.message}</p>}

        <div className="flex flex-row justify-end gap-4">
          <ButtonLink variant="secondary" href={entryUrl}>
            <TiCancel className="text-lg" />
            Cancel
          </ButtonLink>
          <Button type="submit">
            <TiUpload className="text-lg" />
            Save
          </Button>
        </div>
      </form>
      <Toast
        message={mutationError ? "Error saving" : ""}
        isOpen={!!mutationError}
        onClose={() => {}}
      />
    </LayoutOverlay>
  );
}

export default function EditEntry() {
  const { entryId } = useParams();
  if (!entryId) return <Fallback />;

  return (
    <Suspense fallback={<Fallback />}>
      <EditEntryChild entryId={entryId} />
    </Suspense>
  );
}
