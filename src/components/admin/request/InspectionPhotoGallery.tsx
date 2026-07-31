"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  auth,
} from "@/lib/firebase";

interface Props {
  photos?: string[];
}

interface Photo {
  key: string;
  url: string;
}

export default function InspectionPhotoGallery({
  photos = [],
}: Props) {
  const [resolvedPhotos, setResolvedPhotos] =
    useState<Photo[]>([]);

  const [loading, setLoading] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPhotos() {
      if (!photos.length) {
        setResolvedPhotos([]);
        return;
      }

      try {
        setLoading(true);

        const currentUser =
          auth.currentUser;

        if (!currentUser) {
          throw new Error(
            "You must be signed in to view inspection photos."
          );
        }

        const idToken =
          await currentUser.getIdToken();

        const results =
          await Promise.all(
            photos.map(
              async (key) => {
                const response =
                  await fetch(
                    "/api/r2/view",
                    {
                      method:
                        "POST",

                      headers: {
                        "Content-Type":
                          "application/json",

                        Authorization:
                          `Bearer ${idToken}`,
                      },

                      body:
                        JSON.stringify({
                          key,
                        }),
                    }
                  );

                const result =
                  await response.json();

                if (
                  !response.ok ||
                  !result.success ||
                  !result.url
                ) {
                  throw new Error(
                    result.error ||
                      "Unable to load inspection photo."
                  );
                }

                return {
                  key,
                  url:
                    result.url as string,
                };
              }
            )
          );

        if (!cancelled) {
          setResolvedPhotos(
            results
          );
        }
      } catch (error) {
        console.error(
          "Inspection photos load failed:",
          error
        );

        if (!cancelled) {
          setResolvedPhotos(
            []
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPhotos();

    return () => {
      cancelled = true;
    };
  }, [photos]);

  if (!photos.length) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-5">
        <p className="text-sm text-slate-500">
          No inspection photos uploaded yet.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-5">
        <p className="text-sm text-slate-400">
          Loading inspection photos...
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">

      {resolvedPhotos.map(
        (photo) => (
          <a
            key={photo.key}
            href={photo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
          >
            <img
              src={photo.url}
              alt="Warehouse inspection"
              className="h-44 w-full object-cover transition-transform group-hover:scale-105"
            />

            <div className="border-t border-slate-800 p-3">
              <p className="text-xs font-medium text-purple-400">
                View Full Photo
              </p>
            </div>
          </a>
        )
      )}

    </div>
  );
}