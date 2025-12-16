import { useSuspenseQuery } from "@tanstack/react-query";
import { useTRPC } from "../utils/trpc";
import { Suspense, useState } from "react";
import { Toast } from "../components/Toast";
import { TiUpload } from "react-icons/ti";
import { Button } from "../components/Button";
import EntryList from "../components/EntryList";
import { useLocation, useParams } from "wouter";
import { entrySlug } from "../data/routes";

function Fallback() {
  return (
    <div className="space-y-4 p-2">
      <h1>Loading...</h1>
      <EntryList>
        <EntryList.Item label="Loading..." value="••••••••••••" setToastMessage={() => {}} />
      </EntryList>
    </div>
  );
}

function DisplayEntryList() {
  const trpc = useTRPC();
  const { entryId } = useParams();
  const [_, navigate] = useLocation();

  if (!entryId) return <Fallback />;

  const { data } = useSuspenseQuery(trpc.entry.getById.queryOptions(entryId));
  const [toastMessage, setToastMessage] = useState("");

  const handleSave = () => {
    navigate(`/${entrySlug}/${entryId}`);
  };

  return (
    <>
      <div className="space-y-4 p-2">
        <div className="grid grid-cols-[1fr_auto] items-center">
          <h1>{data.name}</h1>
          <div className="flex flex-row gap-2">
            <Button onClick={handleSave}>
              <TiUpload className="text-lg" />
              Save
            </Button>
          </div>
        </div>

        <EntryList>
          <EntryList.Item label="Email" value={data.email} setToastMessage={setToastMessage} />

          <EntryList.Item
            label="Password"
            value={data.password}
            setToastMessage={setToastMessage}
            valueHidden
          />
        </EntryList>
      </div>
      <Toast message={toastMessage} isOpen={!!toastMessage} onClose={() => setToastMessage("")} />
    </>
  );
}

export default function DisplayEntry() {
  return (
    <Suspense fallback={<Fallback />}>
      <DisplayEntryList />
    </Suspense>
  );
}
