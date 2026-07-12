// Re-encrypts protected CRM values under the active key after a planned local key rotation.

import { blindIndex, decryptJson, encryptJson } from "./cryptoVault.js";
import { withCrmTransaction } from "./postgres.js";

const rotationActor = { id: "encryption-rotation", role: "superuser" };

export async function rotateCrmEncryption() {
  return withCrmTransaction(rotationActor, async (client) => {
    const customers = await client.query(
      "SELECT id,phone_cipher,whatsapp_cipher,identity_cipher FROM crm_customers FOR UPDATE",
    );
    for (const customer of customers.rows) {
      const phone = decryptJson(customer.phone_cipher);
      const whatsapp = decryptJson(customer.whatsapp_cipher);
      const identity = decryptJson(customer.identity_cipher);
      await client.query(
        `UPDATE crm_customers
         SET phone_cipher=$2,phone_hash=$3,whatsapp_cipher=$4,whatsapp_hash=$5,
             identity_cipher=$6,identity_hash=$7,updated_at=now(),updated_by=$8
         WHERE id=$1`,
        [customer.id, encryptJson(phone), blindIndex(phone.e164), whatsapp ? encryptJson(whatsapp) : null,
          whatsapp ? blindIndex(whatsapp.e164) : null, identity ? encryptJson(identity) : null,
          identity ? blindIndex(identity.number) : null, rotationActor.id],
      );
    }

    const addresses = await client.query("SELECT customer_id,address_cipher FROM crm_customer_addresses FOR UPDATE");
    for (const address of addresses.rows) {
      await client.query(
        "UPDATE crm_customer_addresses SET address_cipher=$2,updated_at=now(),updated_by=$3 WHERE customer_id=$1",
        [address.customer_id, encryptJson(decryptJson(address.address_cipher)), rotationActor.id],
      );
    }

    const prescriptions = await client.query("SELECT id,prescription_cipher FROM crm_prescriptions FOR UPDATE");
    for (const prescription of prescriptions.rows) {
      await client.query(
        "UPDATE crm_prescriptions SET prescription_cipher=$2,updated_at=now(),updated_by=$3 WHERE id=$1",
        [prescription.id, encryptJson(decryptJson(prescription.prescription_cipher)), rotationActor.id],
      );
    }

    return { customers: customers.rowCount, addresses: addresses.rowCount, prescriptions: prescriptions.rowCount };
  });
}
