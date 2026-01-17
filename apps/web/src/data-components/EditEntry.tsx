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
import EditEntryList from "../components/EditEntryList";
import { getInputsFromData } from "../utils/label-mapping";
import { cn } from "../utils/tailwind";

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
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 p-2">
        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
          <label htmlFor="name" className="sr-only">
            Name
          </label>
          <input
            {...register("name")}
            id="name"
            className={cn(
              "w-full rounded border bg-transparent text-3xl",
              "focus:ring-primary-900 focus:ring-2 focus:outline-none",
            )}
          />
          <div className="flex flex-row gap-2">
            <Button type="submit">
              <TiUpload className="text-lg" />
              Save
            </Button>
            <ButtonLink variant="secondary" href={entryUrl}>
              <TiCancel className="text-lg" />
              Cancel
            </ButtonLink>
          </div>
        </div>
        {errors.name && <p className="text-red-500">{errors.name.message}</p>}

        <EditEntryList register={register} items={getInputsFromData(initialData)} errors={errors} />

        {mutationError && <p className="text-red-500">{mutationError.message}</p>}
      </form>
      <Toast
        message={mutationError ? "Error saving" : ""}
        isOpen={!!mutationError}
        onClose={() => {}}
      />
    </>
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
