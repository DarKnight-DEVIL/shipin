import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    color: "#111827",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 25,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
  },

  brand: {
    fontSize: 24,
    fontWeight: "bold",
  },

  subtitle: {
    marginTop: 5,
    fontSize: 9,
    color: "#6b7280",
  },

  invoiceTitle: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "right",
  },

  invoiceInfo: {
    marginTop: 5,
    fontSize: 9,
    color: "#6b7280",
    textAlign: "right",
  },

  customerSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 25,
  },

  label: {
    fontSize: 8,
    color: "#6b7280",
    marginBottom: 4,
  },

  value: {
    fontSize: 10,
    fontWeight: "bold",
  },

  secondaryValue: {
    fontSize: 9,
    marginTop: 3,
    color: "#4b5563",
  },

  section: {
    marginTop: 20,
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 5,
  },

  sectionDescription: {
    fontSize: 9,
    color: "#6b7280",
    marginBottom: 12,
  },

  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    paddingBottom: 6,
    marginBottom: 3,
  },

  tableRow: {
    flexDirection: "row",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },

  productColumn: {
    width: "46%",
  },

  qtyColumn: {
    width: "14%",
    textAlign: "center",
  },

  priceColumn: {
    width: "20%",
    textAlign: "right",
  },

  totalColumn: {
    width: "20%",
    textAlign: "right",
  },

  summaryBox: {
    marginTop: 15,
    marginLeft: "auto",
    width: "55%",
    padding: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
  },

  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },

  summaryLabel: {
    color: "#4b5563",
  },

  summaryValue: {
    fontWeight: "bold",
  },

  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#d1d5db",
  },

  totalLabel: {
    fontSize: 12,
    fontWeight: "bold",
  },

  totalValue: {
    fontSize: 12,
    fontWeight: "bold",
  },

  additionalCard: {
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
  },

  additionalTitle: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 8,
  },

  additionalInfo: {
    fontSize: 9,
    color: "#4b5563",
    marginBottom: 8,
  },

  notice: {
    marginTop: 25,
    padding: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
  },

  noticeTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 5,
  },

  noticeText: {
    fontSize: 8,
    color: "#6b7280",
    lineHeight: 1.5,
  },
});

export default function InvoicePDF({
  invoice,
}: {
  invoice: any;
}) {
  const originalItems =
    invoice.originalItems || [];

  const additionalPurchases =
    invoice.additionalPurchases || [];

  return (
    <Document>

      <Page
        size="A4"
        style={styles.page}
      >

        {/* HEADER */}

        <View style={styles.header}>

          <View>

            <Text style={styles.brand}>
              ShipIN
            </Text>

            <Text style={styles.subtitle}>
              Global Shopping & Package Forwarding
            </Text>

            <Text style={styles.subtitle}>
              contact.shipin@gmail.com
            </Text>

          </View>


          <View>

            <Text style={styles.invoiceTitle}>
              PURCHASE INVOICE
            </Text>

            <Text style={styles.invoiceInfo}>
              INV-{invoice.id || "Draft"}
            </Text>

            <Text style={styles.invoiceInfo}>
              {new Date().toLocaleDateString()}
            </Text>

          </View>

        </View>


        {/* CUSTOMER */}

        <View style={styles.customerSection}>

          <View>

            <Text style={styles.label}>
              BILL TO
            </Text>

            <Text style={styles.value}>
              {invoice.customerName ||
                "Customer"}
            </Text>

            <Text style={styles.secondaryValue}>
              {invoice.email ||
                "No email provided"}
            </Text>

          </View>


          <View>

            <Text style={styles.label}>
              ORDER
            </Text>

            <Text style={styles.value}>
              #
              {invoice.requestId ||
                invoice.id}
            </Text>

          </View>

        </View>


        {/* ORIGINAL ORDER */}

        <View style={styles.section}>

          <Text style={styles.sectionTitle}>
            Original Order
          </Text>

          <Text style={styles.sectionDescription}>
            Products included in the original purchase request.
          </Text>


          <View style={styles.tableHeader}>

            <Text style={styles.productColumn}>
              Product
            </Text>

            <Text style={styles.qtyColumn}>
              Qty
            </Text>

            <Text style={styles.priceColumn}>
              Unit
            </Text>

            <Text style={styles.totalColumn}>
              Total
            </Text>

          </View>


          {originalItems.map(
            (
              item: any,
              index: number
            ) => (

            <View
              key={
                item.id ||
                index
              }
              style={styles.tableRow}
            >

              <Text style={styles.productColumn}>
                {item.name}
              </Text>

              <Text style={styles.qtyColumn}>
                {item.quantity}
              </Text>

              <Text style={styles.priceColumn}>
                $
                {(item.unitPrice || 0).toFixed(
                  2
                )}
              </Text>

              <Text style={styles.totalColumn}>
                $
                {(item.subtotal || 0).toFixed(
                  2
                )}
              </Text>

            </View>

          ))}


          {/* ORIGINAL TOTALS */}

          <View style={styles.summaryBox}>

            <SummaryRow
              label="Products"
              value={
                invoice.productsTotal
              }
            />

            <SummaryRow
              label="Domestic Shipping"
              value={
                invoice.domesticShipping
              }
            />

            <SummaryRow
              label="Estimated Shipping"
              value={
                invoice.internationalShipping
              }
            />

            <SummaryRow
              label="Service Fee"
              value={
                invoice.serviceFee
              }
            />


            <View style={styles.totalRow}>

              <Text style={styles.totalLabel}>
                Original Total
              </Text>

              <Text style={styles.totalValue}>
                $
                {(
                  invoice.originalTotal ||
                  0
                ).toFixed(2)}
              </Text>

            </View>

          </View>

        </View>


        {/* ADDITIONAL PURCHASES */}

        {additionalPurchases.length >
          0 && (

          <View style={styles.section}>

            <Text style={styles.sectionTitle}>
              Additional Purchases
            </Text>

            <Text style={styles.sectionDescription}>
              Items added and paid for after the original order.
            </Text>


            {additionalPurchases.map(
              (
                purchase: any,
                index: number
              ) => (

              <View
                key={
                  purchase.id ||
                  index
                }
                style={
                  styles.additionalCard
                }
                wrap={false}
              >

                <Text style={styles.additionalTitle}>
                  {purchase.name}
                </Text>

                <Text style={styles.additionalInfo}>
                  Quantity:{" "}
                  {purchase.quantity} | Unit Price: $
                  {(
                    purchase.unitPrice ||
                    0
                  ).toFixed(2)}
                </Text>


                <SummaryRow
                  label="Product Subtotal"
                  value={
                    purchase.subtotal
                  }
                />


                {purchase.serviceFee >
                  0 && (

                  <SummaryRow
                    label="Service Fee"
                    value={
                      purchase.serviceFee
                    }
                  />

                )}


                {purchase.repackingFee >
                  0 && (

                  <SummaryRow
                    label="Repacking Fee"
                    value={
                      purchase.repackingFee
                    }
                  />

                )}


                {purchase.storageFee >
                  0 && (

                  <SummaryRow
                    label="Storage Fee"
                    value={
                      purchase.storageFee
                    }
                  />

                )}


                <View style={styles.totalRow}>

                  <Text style={styles.totalLabel}>
                    Amount Paid
                  </Text>

                  <Text style={styles.totalValue}>
                    $
                    {(
                      purchase.totalPaid ||
                      0
                    ).toFixed(2)}
                  </Text>

                </View>

              </View>

            ))}

          </View>

        )}


        {/* PAYMENT SUMMARY */}

        <View style={styles.section}>

          <Text style={styles.sectionTitle}>
            Payment Summary
          </Text>


          <View style={styles.summaryBox}>

            <SummaryRow
              label="Original Payment"
              value={
                invoice.originalTotal
              }
            />


            {invoice.additionalTotal >
              0 && (

              <SummaryRow
                label="Additional Payments"
                value={
                  invoice.additionalTotal
                }
              />

            )}


            <View style={styles.totalRow}>

              <Text style={styles.totalLabel}>
                Total Paid
              </Text>

              <Text style={styles.totalValue}>
                $
                {(
                  invoice.totalPaid ||
                  0
                ).toFixed(2)}
              </Text>

            </View>

          </View>

        </View>


        {/* NOTICE */}

        <View style={styles.notice}>

          <Text style={styles.noticeTitle}>
            Important Notice
          </Text>

          <Text style={styles.noticeText}>
            The international shipping charge shown above is an estimate.
            The final shipping cost will be confirmed after your package
            reaches the ShipIN warehouse. If the actual shipping cost differs,
            only the difference will be charged or refunded before dispatch.
          </Text>

        </View>

      </Page>

    </Document>
  );
}


/* =========================================
   SUMMARY ROW
========================================= */

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value?: number;
}) {
  return (
    <View style={styles.summaryRow}>

      <Text style={styles.summaryLabel}>
        {label}
      </Text>

      <Text style={styles.summaryValue}>
        $
        {(value || 0).toFixed(
          2
        )}
      </Text>

    </View>
  );
}