import { PaymentWidget } from "@/widgets/PaymentWidget";

const PayPage = async ({
  params,
}: {
  params: Promise<{ registrationId: string }>;
}) => {
  const { registrationId } = await params;

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4">
      <h1 className="text-2xl font-bold">Thanh toán</h1>
      <PaymentWidget
        registration={null}
        workshop={null}
        loading={false}
        registrationId={registrationId}
      />
    </div>
  );
};

export default PayPage;
