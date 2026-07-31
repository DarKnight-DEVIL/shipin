"use client";

interface Activity {
  id: string;
  title: string;
  description: string;
  createdAt?: Date;
}

interface Props {
  activities: Activity[];
}

export default function RecentActivity({
  activities,
}: Props) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">

      <h2 className="text-2xl font-bold text-white mb-6">
        Recent Activity
      </h2>

      <div className="space-y-5">

        {activities.length === 0 && (
          <p className="text-slate-500">
            No recent activity.
          </p>
        )}

        {activities.map((activity) => (

          <div
            key={activity.id}
            className="border-b border-slate-800 pb-4"
          >

            <h3 className="font-semibold text-white">
              {activity.title}
            </h3>

            <p className="text-slate-400 mt-1">
              {activity.description}
            </p>

            {activity.createdAt && (
              <p className="text-xs text-slate-500 mt-2">
                {activity.createdAt.toLocaleString()}
              </p>
            )}

          </div>

        ))}

      </div>

    </div>
  );
}