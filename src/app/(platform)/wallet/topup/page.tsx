"use client";

import { useState } from "react";
import { PayPalButtons } from "@paypal/react-paypal-js";
import { toast } from "sonner";
export default function WalletTopupPage() {
  const [amount, setAmount] = useState(50);

  return (
    <div className="max-w-3xl mx-auto p-8">

      <h1 className="text-4xl font-bold text-white mb-8">
        Top Up Wallet
      </h1>

      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8">

        <h2 className="text-xl text-white mb-6">
          Select Amount
        </h2>

        <div className="grid grid-cols-4 gap-4 mb-8">

          {[25,50,100,250].map((value)=>(
            <button
              key={value}
              onClick={()=>setAmount(value)}
              className={`rounded-xl py-4 font-semibold ${
                amount===value
                  ? "bg-purple-600"
                  : "bg-slate-800"
              }`}
            >
              ${value}
            </button>
          ))}

        </div>

        <input
          type="number"
          value={amount}
          onChange={(e)=>setAmount(Number(e.target.value))}
          className="w-full rounded-xl bg-slate-950 border border-slate-700 p-4 mb-8"
        />

        <PayPalButtons
          createOrder={async()=>{

            const response=await fetch("/api/paypal/create-order",{
              method:"POST",
              headers:{
                "Content-Type":"application/json"
              },
              body:JSON.stringify({
                amount
              })
            });

            const data=await response.json();

            return data.id;

          }}

          onApprove={async(data)=>{

            await fetch("/api/paypal/capture-wallet-topup",{
              method:"POST",
              headers:{
                "Content-Type":"application/json"
              },
              body:JSON.stringify({
                orderID:data.orderID,
                amount
              })
            });

            toast.success("Wallet updated.");

            location.href="/wallet";

          }}

        />

      </div>

    </div>
  );
}