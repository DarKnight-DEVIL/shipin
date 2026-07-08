"use client";

export default function TestApiPage() {
  const testApi = async () => {
    try {
      const response = await fetch(
        "/api/paypal/create-order",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: 10,
          }),
        }
      );

      const data = await response.json();

      console.log(data);

      alert(JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(error);
      alert("Request failed");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8">
      <h1 className="text-4xl font-bold mb-8">
        Test PayPal API
      </h1>

      <button
        onClick={testApi}
        className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl"
      >
        Test API
      </button>
    </div>
  );
}