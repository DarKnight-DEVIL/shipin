"use client";

import { useState } from "react";
import { saveInspectionPhotos } from "@/lib/firestore";
import { auth } from "@/lib/firebase";
import Section from "@/components/ui/Section";
import ActionButton from "@/components/ui/ActionButton";

interface Props {
  requestId: string;
  onUploadSuccess?: () => void | Promise<void>;
}

export default function InspectionPhotos({
  requestId,
  onUploadSuccess,
}: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  async function uploadPhotos() {
    if (files.length === 0) {
      alert("Select photos first.");
      return;
    }

    try {
      setUploading(true);

      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error(
          "You must be signed in to upload inspection photos."
        );
      }

      const idToken = await currentUser.getIdToken();

      const objectKeys: string[] = [];

      for (const file of files) {
        const formData = new FormData();

        formData.append("file", file);
        formData.append("requestId", requestId);

        const response = await fetch("/api/r2/upload", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
          body: formData,
        });

        const result = await response.json();

        if (!response.ok || !result.success || !result.key) {
          throw new Error(
            result.error || "Unable to upload inspection photo."
          );
        }

        objectKeys.push(result.key);
      }

      /*
       * Store the private R2 object keys
       * in the request document.
       */
      await saveInspectionPhotos(requestId, objectKeys);

      setFiles([]);

      alert("Inspection photos uploaded successfully.");

      if (onUploadSuccess) {
        await onUploadSuccess();
      }
    } catch (error) {
      console.error("Inspection photo upload failed:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Unable to upload inspection photos."
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <Section
      title="Inspection Photos"
      subtitle="Upload warehouse inspection photos"
    >
      <div className="space-y-5">
        <input
          multiple
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading}
          onChange={(e) =>
            setFiles(Array.from(e.target.files || []))
          }
        />

        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="rounded-lg border border-slate-700 p-3"
              >
                {file.name}
              </div>
            ))}
          </div>
        )}

        <ActionButton
          onClick={uploadPhotos}
          disabled={uploading}
        >
          {uploading ? "Uploading..." : "Upload Photos"}
        </ActionButton>
      </div>
    </Section>
  );
}