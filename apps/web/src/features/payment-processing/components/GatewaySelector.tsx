"use client";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { PaymentGateway } from "@/types/registration";

interface GatewaySelectorProps {
  value: PaymentGateway | null;
  onChange: (gateway: PaymentGateway) => void;
  disabled?: boolean;
}

const gateways: { value: PaymentGateway; label: string }[] = [
  { value: "VNPAY", label: "VNPAY" },
  { value: "STRIPE", label: "Stripe" },
  { value: "MOMO", label: "MoMo" },
];

if (process.env.NODE_ENV === "development") {
  gateways.push({ value: "MOCK", label: "MOCK (Dev)" });
}

export function GatewaySelector({
  value,
  onChange,
  disabled,
}: GatewaySelectorProps) {
  return (
    <RadioGroup
      value={value ?? ""}
      onValueChange={(v) => onChange(v as PaymentGateway)}
      disabled={disabled}
    >
      {gateways.map((g) => (
        <div key={g.value} className="flex items-center gap-2">
          <RadioGroupItem value={g.value} id={`gateway-${g.value}`} />
          <Label htmlFor={`gateway-${g.value}`}>{g.label}</Label>
        </div>
      ))}
    </RadioGroup>
  );
}
