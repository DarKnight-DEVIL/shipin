"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import RequestCard from "@/components/admin/RequestCard";

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRequests = async () => {
      try {
        const snapshot = await getDocs(collection(db, "requests"));
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setRequests(data);
      } catch (error) {
        console.error(error);
      }
      setLoading(false);
    };

    loadRequests();
  }, []);

  if (loading) {
    return <div className="p-8 text-white">Loading requests...</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold text-white mb-8">
        Requests
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {requests.map((request) => (
          <RequestCard
            key={request.id}
            request={request}
          />
        ))}
      </div>
    </div>
  );
}