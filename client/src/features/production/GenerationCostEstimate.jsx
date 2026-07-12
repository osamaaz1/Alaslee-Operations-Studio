import { useEffect, useState } from "react";
import { CircleDollarSign, LoaderCircle } from "lucide-react";
import { get } from "../../api.js";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const integer = new Intl.NumberFormat("ar-SA-u-nu-latn", { maximumFractionDigits: 0 });

export function GenerationCostEstimate({ provider, productId, batchId }) {
  const [state, setState] = useState({ loading: false, estimate: null, error: "" });
  const resource = batchId ? `batches/${encodeURIComponent(batchId)}` : productId ? `products/${encodeURIComponent(productId)}` : "";

  useEffect(() => {
    let active = true;
    if (provider !== "gpt" || !resource) {
      setState({ loading: false, estimate: null, error: "" });
      return () => { active = false; };
    }
    setState({ loading: true, estimate: null, error: "" });
    get(`/${resource}/output-1/estimate`)
      .then((estimate) => active && setState({ loading: false, estimate, error: "" }))
      .catch((error) => active && setState({ loading: false, estimate: null, error: error.message }));
    return () => { active = false; };
  }, [provider, resource]);

  if (provider !== "gpt" || !resource) return null;
  const estimate = state.estimate;
  return <section className="generation-cost" aria-live="polite">
    <header><span><CircleDollarSign size={19} /></span><div><strong>التكلفة المتوقعة قبل التوليد</strong><small>تقدير GPT بالدولار الأمريكي، وقد تختلف الفاتورة النهائية بحسب الاستخدام الفعلي.</small></div></header>
    {state.loading ? <p className="generation-cost-loading"><LoaderCircle className="spin" size={18} />جارٍ حساب التكلفة…</p> : state.error ? <p className="generation-cost-error">تعذر حساب التكلفة: {state.error}</p> : estimate ? <>
      <div className="generation-cost-grid"><div><span>المتوقع</span><b dir="ltr">{usd.format(estimate.estimatedUsd || 0)}</b></div><div><span>الحد الاحتياطي</span><b dir="ltr">{usd.format(estimate.safetyCeilingUsd || 0)}</b></div><div><span>طلبات التوليد</span><b>{integer.format(estimate.requestCount || 0)}</b></div><div><span>الجودة</span><b>{qualityLabel(estimate.quality)}</b></div></div>
      <p className="generation-cost-detail">{estimate.productCount ? `${integer.format(estimate.productCount)} منتجات · ` : ""}{integer.format(estimate.outputCount || estimate.requestCount || 0)} صور متوقعة</p>
    </> : null}
  </section>;
}

function qualityLabel(quality) {
  return ({ low: "منخفضة", medium: "متوسطة", high: "عالية", auto: "تلقائية" })[quality] || quality || "—";
}
