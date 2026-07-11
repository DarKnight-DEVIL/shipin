"use client";

import { useState } from "react";
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

  async function uploadPhotos() {
    // Firebase Storage upload will go here later

    alert("Photos uploaded successfully.");

    if (onUploadSuccess) {
      await onUploadSuccess();
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
          accept="image/*"
          onChange={(e) =>
            setFiles(Array.from(e.target.files || []))
          }
        />

        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.name}
                className="rounded-lg border border-slate-700 p-3"
              >
                {file.name}
              </div>
            ))}
          </div>
        )}

        <ActionButton onClick={uploadPhotos}>
          Upload Photos
        </ActionButton>
      </div>
    </Section>
  );
}