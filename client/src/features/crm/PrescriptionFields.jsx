// Renders conditional optical Rx controls with audited exceptional values.

import { RX_EXCEPTION_LIMITS, RX_LIMITS } from "../../../../shared/crm/constants.js";

export const emptyPrescription = {
  examDate: new Date().toISOString().slice(0, 10),
  right: { sph: 0, cyl: 0, axis: "", add: "" }, left: { sph: 0, cyl: 0, axis: "", add: "" },
  pdMode: "binocular", binocularPd: 62, rightPd: "", leftPd: "", exceptionReason: "", exceptionalEntry: false,
};

export function PrescriptionFields({ value, onChange, errors = {} }) {
  const set = (path, next) => onChange(updatePath(value, path, next));
  return <fieldset className="rx-card">
    <legend>بيانات الكشف الطبي</legend>
    <div className="form-grid two"><Field label="تاريخ الكشف" error={errors.examDate}><input type="date" value={value.examDate} onChange={(e) => set("examDate", e.target.value)} /></Field>
      <label className="check-card"><input type="checkbox" checked={value.exceptionalEntry} onChange={(e) => set("exceptionalEntry", e.target.checked)} /><span><b>قيمة استثنائية</b><small>تسمح بإدخال قيمة خارج النطاق مع سبب</small></span></label></div>
    <div className="rx-eyes"><EyeFields title="العين اليمنى · Right / OD" side="right" value={value.right} onChange={set} exceptional={value.exceptionalEntry} errors={errors} />
      <EyeFields title="العين اليسرى · Left / OS" side="left" value={value.left} onChange={set} exceptional={value.exceptionalEntry} errors={errors} /></div>
    <div className="pd-row"><Field label="طريقة قياس IPD"><select value={value.pdMode} onChange={(e) => set("pdMode", e.target.value)}><option value="binocular">قياس واحد IPD</option><option value="monocular">يمين ويسار PD</option></select></Field>
      {value.pdMode === "binocular" ? <RxControl label="IPD" value={value.binocularPd} range={RX_LIMITS.binocularPd} exceptionalRange={RX_EXCEPTION_LIMITS.binocularPd} integer exceptional={value.exceptionalEntry} onChange={(next) => set("binocularPd", next)} error={errors.binocularPd} /> : <><RxControl label="PD يمين" value={value.rightPd} range={RX_LIMITS.monocularPd} exceptionalRange={RX_EXCEPTION_LIMITS.monocularPd} integer exceptional={value.exceptionalEntry} onChange={(next) => set("rightPd", next)} error={errors.rightPd} /><RxControl label="PD يسار" value={value.leftPd} range={RX_LIMITS.monocularPd} exceptionalRange={RX_EXCEPTION_LIMITS.monocularPd} integer exceptional={value.exceptionalEntry} onChange={(next) => set("leftPd", next)} error={errors.leftPd} /></>}</div>
    {value.exceptionalEntry && <Field label="سبب القيمة الاستثنائية" error={errors.exceptionReason}><textarea value={value.exceptionReason} onChange={(e) => set("exceptionReason", e.target.value)} maxLength="300" required /></Field>}
  </fieldset>;
}

function EyeFields({ title, side, value, onChange, exceptional, errors }) {
  return <section><h3>{title}</h3><div className="rx-grid">
    <RxControl label="SPH" value={value.sph} range={RX_LIMITS.sph} exceptionalRange={RX_EXCEPTION_LIMITS.sph} exceptional={exceptional} onChange={(next) => onChange(`${side}.sph`, next)} error={errors[`${side}.sph`]} />
    <RxControl label="CYL" value={value.cyl} range={RX_LIMITS.cyl} exceptionalRange={RX_EXCEPTION_LIMITS.cyl} exceptional={exceptional} onChange={(next) => onChange(`${side}.cyl`, next)} error={errors[`${side}.cyl`]} />
    <RxControl label="Axis" value={value.axis} range={RX_LIMITS.axis} exceptionalRange={RX_EXCEPTION_LIMITS.axis} integer exceptional={exceptional} onChange={(next) => onChange(`${side}.axis`, next)} error={errors[`${side}.axis`]} disabled={Number(value.cyl || 0) === 0} />
    <RxControl label="ADD" value={value.add} range={RX_LIMITS.add} exceptionalRange={RX_EXCEPTION_LIMITS.add} exceptional={exceptional} onChange={(next) => onChange(`${side}.add`, next)} error={errors[`${side}.add`]} optional />
  </div></section>;
}

function RxControl({ label, value, range, exceptionalRange = range, exceptional, integer, onChange, error, disabled, optional }) {
  const values = rangeValues(range);
  return <Field label={label} error={error}>{exceptional ? <input type="number" min={exceptionalRange[0]} max={exceptionalRange[1]} step={integer ? 1 : exceptionalRange[2]} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} /> : <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>{optional && <option value="">—</option>}{values.map((item) => <option value={item} key={item}>{signed(item, integer)}</option>)}</select>}</Field>;
}

function Field({ label, error, children }) { return <label className="crm-field"><span>{label}</span>{children}{error && <small className="field-error">{error}</small>}</label>; }
function rangeValues([min, max, step]) { const result = []; for (let value = min; value <= max + 0.0001; value += step) result.push(Number(value.toFixed(2))); return result; }
function signed(value, integer = false) { const number = Number(value); const text = integer ? String(number) : number.toFixed(2); return number > 0 && !integer ? `+${text}` : text; }
function updatePath(source, path, value) { const parts = path.split("."); const next = structuredClone(source); let target = next; parts.slice(0, -1).forEach((part) => { target = target[part]; }); target[parts.at(-1)] = value; return next; }
