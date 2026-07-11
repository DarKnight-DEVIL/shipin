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
    fontSize: 12,
  },

  title: {
    fontSize: 24,
    marginBottom: 20,
    fontWeight: "bold",
  },

  section: {
    marginBottom: 12,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },

  total: {
    marginTop: 15,
    fontSize: 16,
    fontWeight: "bold",
  },
});

export default function InvoicePDF({
  invoice,
}: {
  invoice: any;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>

        <Text style={styles.title}>
          ShipIN Purchase Invoice
        </Text>

        {invoice.items.map(
          (item: any, index: number) => (
            <View
              key={index}
              style={styles.section}
            >
              <View style={styles.row}>
                <Text>{item.name}</Text>

                <Text>
                  {item.quantity} × $
                  {item.unitPrice}
                </Text>

                <Text>
                  ${item.subtotal}
                </Text>
              </View>
            </View>
          )
        )}

        <View style={styles.section}>

          <View style={styles.row}>
            <Text>Products</Text>
            <Text>${invoice.productsTotal}</Text>
          </View>

          <View style={styles.row}>
            <Text>Domestic Shipping</Text>
            <Text>${invoice.domesticShipping}</Text>
          </View>

          <View style={styles.row}>
            <Text>Estimated Shipping</Text>
            <Text>${invoice.internationalShipping}</Text>
          </View>

          <View style={styles.row}>
            <Text>Service Fee</Text>
            <Text>${invoice.serviceFee}</Text>
          </View>

        </View>

        <Text style={styles.total}>
          Estimated Total: ${invoice.grandTotal}
        </Text>

      </Page>
    </Document>
  );
}