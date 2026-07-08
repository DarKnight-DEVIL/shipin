export default function TestPaypalPage() {
  return (
    <div className="p-8 text-white">
      <h1>PayPal Test</h1>

      <p>
        {process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID}
      </p>
    </div>
  );
}