// Reads paginated products, stores, and processed stock transactions from Daftra.

import { config } from "../config.js";
import { AppError } from "../utils/errors.js";

const requestTimeoutMs = 30_000;

export function daftraConfigured() {
  return Boolean(config.daftra.subdomain && (config.daftra.apiKey || config.daftra.accessToken));
}

export async function fetchDaftraProducts() {
  return fetchAll("products.json", "Product", { load_custom_data: 1 });
}

export async function fetchDaftraStores() {
  return fetchAll("stores.json", "Store");
}

export async function fetchDaftraTransactions(dateFrom) {
  const params = dateFrom ? { date_from: dateFrom } : {};
  return fetchAll("stock_transactions.json", "StockTransaction", params);
}

async function fetchAll(endpoint, wrapper, params = {}) {
  assertConfigured();
  const rows = [];
  let page = 1;
  let pageCount = 1;
  do {
    const body = await fetchPage(endpoint, { ...params, page, limit: config.daftra.pageLimit });
    for (const item of body.data || []) rows.push(item?.[wrapper] || item);
    pageCount = positiveInteger(body.pagination?.page_count, page);
    page += 1;
  } while (page <= pageCount);
  return rows;
}

async function fetchPage(endpoint, params) {
  const url = new URL(`/api2/${endpoint}`, `https://${config.daftra.subdomain}.daftra.com`);
  Object.entries(params).forEach(([key, value]) => value !== undefined && url.searchParams.set(key, value));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, { headers: headers(), signal: controller.signal });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.result === "failed") {
      throw new AppError(`تعذر مزامنة دفترة (${response.status}).`, 502);
    }
    return body || {};
  } catch (error) {
    if (error.name === "AbortError") throw new AppError("انتهت مهلة الاتصال بدفترة.", 504);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function headers() {
  const result = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (config.daftra.apiKey) result.apikey = config.daftra.apiKey;
  if (config.daftra.accessToken) result.Authorization = `Bearer ${config.daftra.accessToken}`;
  return result;
}

function assertConfigured() {
  if (!daftraConfigured()) throw new AppError("بيانات اتصال دفترة غير مهيأة.", 503);
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
