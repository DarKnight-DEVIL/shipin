export interface RequestItem {
  name: string;
  quantity: number;
  url?: string;
  unitPrice?: number;
  subtotal?: number;
}

export interface RequestQuote {
  grandTotal: number;
  productsTotal: number;
  domesticShipping: number;
  internationalShipping: number;
  customs: number;
  serviceFee: number;
}

export interface ShipmentTracking {
  carrier: string;
  trackingNumber: string;
  trackingUrl: string;
  estimatedDelivery: string;
}

export interface Request {
  id: string;

  userId: string;
  email: string;

  status: string;

  items: RequestItem[];

  quote?: RequestQuote;

  tracking?: ShipmentTracking;

  createdAt?: any;
  updatedAt?: any;

  deliveredAt?: any;
}