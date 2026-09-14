import React, { useState, useEffect, useCallback } from "react";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import {
  LayoutDashboard, Users, Briefcase, CheckSquare, Calendar as CalendarIcon,
  Wallet, Plus, X, Trash2, Search, LogOut, Pencil, Mail, Check
} from "lucide-react";
import { supabase } from "./supabaseClient.js";

const NAVY = "#0F2A43";
const GOLD = "#B08D57";
const CREAM = "#FBFAF7";
const INK = "#2C2C2A";
const MUTED = "#6b6a63";
const GOOGLE_CLIENT_ID = "823117991422-0c5s9k8fkfej75b2knaom078bv88odpd.apps.googleusercontent.com";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events";

function loadGoogleScript() {
  return new Promise((resolve) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const existing = document.getElementById("google-gsi-script");
    if (existing) { existing.addEventListener("load", () => resolve()); return; }
    const script = document.createElement("script");
    script.id = "google-gsi-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

async function fetchGoogleEvents(accessToken, monthDate) {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).toISOString();
  const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1).toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(start)}&timeMax=${encodeURIComponent(end)}&singleEvents=true&orderBy=startTime`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.items || []).map((ev) => ({
    id: `g-${ev.id}`,
    title: ev.summary || "(sem título)",
    date: (ev.start?.dateTime || ev.start?.date || "").slice(0, 10),
    time: ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "",
    fromGoogle: true,
  }));
}

const SUPABASE_STORAGE_BASE = "https://jrcojsnjxuykdczbqfuo.supabase.co/storage/v1/object/public/newsletter-assets";

async function generateProcuracao(client, extra) {
  const isPJ = client.type === "PJ";
  const templateUrl = `${SUPABASE_STORAGE_BASE}/${isPJ ? "template_procuracao_pj.docx" : "template_procuracao_pf.docx"}`;
  const resp = await fetch(templateUrl);
  if (!resp.ok) throw new Error("Não foi possível baixar o modelo de procuração. Confira se ele foi enviado ao Storage.");
  const arrayBuffer = await resp.arrayBuffer();
  const zip = new PizZip(arrayBuffer);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => "" });

  const data = isPJ
    ? {
        nome: client.name, cnpj: client.cpfCnpj || "", endereco: client.address || "",
        representante: client.representanteLegal || "",
        cidade: extra.cidade, dia: extra.dia, mes: extra.mes, ano: extra.ano,
        nome_assinatura: client.name,
      }
    : {
        nome: client.name, nacionalidade: client.nacionalidade || "", estado_civil: client.estadoCivil || "",
        profissao: client.profissao || "", rg: client.rg || "", orgao_expedidor: client.orgaoExpedidorRg || "",
        cpf: client.cpfCnpj || "", endereco: client.address || "",
        cidade: extra.cidade, dia: extra.dia, mes: extra.mes, ano: extra.ano,
        nome_assinatura: client.name,
      };

  doc.render(data);
  const out = doc.getZip().generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const url = URL.createObjectURL(out);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Procuracao_${client.name.replace(/[^\p{L}\p{N}]+/gu, "_")}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
async function pushEventToGoogle(accessToken, appt, silent) {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
    let start, end;
    if (appt.time) {
      start = { dateTime: `${appt.date}T${appt.time}:00`, timeZone: tz };
      const [h, m] = appt.time.split(":").map(Number);
      const endDate = new Date(appt.date + "T00:00:00");
      endDate.setHours(h, m + 60);
      const endTime = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;
      end = { dateTime: `${appt.date}T${endTime}:00`, timeZone: tz };
    } else {
      start = { date: appt.date };
      end = { date: appt.date };
    }
    const resp = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ summary: appt.title, location: appt.location || undefined, start, end }),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      console.error("Falha ao enviar evento ao Google Agenda", resp.status, errBody);
      if (!silent) alert(`Não foi possível enviar o compromisso ao Google Agenda (erro ${resp.status}). O compromisso foi salvo no app normalmente.`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("Falha ao enviar evento ao Google Agenda", e);
    if (!silent) alert("Não foi possível enviar o compromisso ao Google Agenda (falha de conexão). O compromisso foi salvo no app normalmente.");
    return false;

  }
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
};
const fmtBRL = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fmtDate(iso);
  const datePart = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  const timePart = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${datePart}, ${timePart}`;
};

const STATUS_COLORS = {
  "Ativo": { bg: "#EAF3DE", text: "#27500A" },
  "Suspenso": { bg: "#FAEEDA", text: "#633806" },
  "Encerrado": { bg: "#F1EFE8", text: "#444441" },
};

// Paleta rotativa para tipos de consultoria criados pelo usuário — sempre dessaturada,
// nunca compete visualmente com os sinais de prazo/status
const CASE_TYPE_PALETTE = [
  { bg: "#e4e9ef", border: "#c9d4e0" }, // Negociação
  { bg: "#e9e5f0", border: "#d3ccde" }, // Contratos
  { bg: "#e4efe6", border: "#c7ddcd" }, // Imobiliária
  { bg: "#f4ecd8", border: "#e6d9b4" },
  { bg: "#f0e6e4", border: "#ddc7c2" },
  { bg: "#e6eef0", border: "#c7dae0" },
];

// camelCase (JS) <-> snake_case (Postgres)
const toClient = (r) => ({ id: r.id, name: r.name, type: r.type, email: r.email, phone: r.phone, cpfCnpj: r.cpf_cnpj, rg: r.rg, newsletterOptIn: r.newsletter_opt_in, contactType: r.contact_type || "Cliente", address: r.address, accessCode: r.access_code, nacionalidade: r.nacionalidade, estadoCivil: r.estado_civil, profissao: r.profissao, orgaoExpedidorRg: r.orgao_expedidor_rg, representanteLegal: r.representante_legal });
const toCase = (r) => ({ id: r.id, title: r.title, clientId: r.client_id, number: r.number, area: r.area, status: r.status, caseType: r.case_type || "Judicial", tribunal: r.tribunal, comarca: r.comarca, instancia: r.instancia, vara: r.vara, tribunalLink: r.tribunal_link, judgeId: r.judge_id, balcaoVirtualLink: r.balcao_virtual_link, valorCausa: r.valor_causa, honorariosContratuais: r.honorarios_contratuais, honorariosTipo: r.honorarios_tipo || "fixo", condenacaoResultado: r.condenacao_resultado });
const toTask = (r) => ({ id: r.id, title: r.title, dueDate: r.due_date, done: r.done, caseId: r.case_id, notes: r.notes, completedAt: r.completed_at, isStallAlert: r.is_stall_alert, alertType: r.alert_type, financeId: r.finance_id, recurrenceGroup: r.recurrence_group, sourceNoteId: r.source_note_id, time: r.time, location: r.location, googleSynced: r.google_synced || false });
const toAppt = (r) => ({ id: r.id, title: r.title, date: r.date, time: r.time, location: r.location, googleSynced: r.google_synced || false });
const toFinance = (r) => ({ id: r.id, description: r.description, amount: r.amount, type: r.type, date: r.date, clientId: r.client_id, caseId: r.case_id, bankAccount: r.bank_account, paid: r.paid !== false, recurrenceGroup: r.recurrence_group, settledAt: r.settled_at });
const toEvent = (r) => ({ id: r.id, caseId: r.case_id, date: r.event_date, description: r.description, notes: r.notes });
const toNote = (r) => ({
  id: r.id, caseId: r.case_id, date: r.note_date, content: r.content,
  type: r.type || "reuniao", authorId: r.author_id, authorName: r.author_name,
  occurredAt: r.occurred_at, createdAt: r.created_at, updatedAt: r.updated_at,
  pinned: r.pinned || false, participantIds: r.participant_ids || [],
});
const toDoc = (r) => ({ id: r.id, caseId: r.case_id, name: r.name, driveLink: r.drive_link });
const toPrecedent = (r) => ({ id: r.id, judgeId: r.judge_id, description: r.description, driveLink: r.drive_link });

const TABLE_BY_KEY = {
  clients: "clients", cases: "cases", tasks: "tasks",
  appts: "appointments", finance: "finance_entries",
  events: "case_events", notes: "case_notes", documents: "case_documents",
  precedents: "judge_precedents",
};
const MAPPER_BY_KEY = { clients: toClient, cases: toCase, tasks: toTask, appts: toAppt, finance: toFinance, events: toEvent, notes: toNote, documents: toDoc, precedents: toPrecedent };

async function loadAll() {
  const [c, cs, t, a, f, ev, no, doc, pr, fs] = await Promise.all([
    supabase.from("clients").select("*").order("created_at"),
    supabase.from("cases").select("*").order("created_at"),
    supabase.from("tasks").select("*").order("created_at"),
    supabase.from("appointments").select("*").order("date"),
    supabase.from("finance_entries").select("*").order("date"),
    supabase.from("case_events").select("*").order("event_date"),
    supabase.from("case_notes").select("*").order("note_date", { ascending: false }),
    supabase.from("case_documents").select("*").order("created_at"),
    supabase.from("judge_precedents").select("*").order("created_at"),
    supabase.from("finance_settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  return {
    clients: (c.data || []).map(toClient),
    cases: (cs.data || []).map(toCase),
    tasks: (t.data || []).map(toTask),
    appts: (a.data || []).map(toAppt),
    finance: (f.data || []).map(toFinance),
    events: (ev.data || []).map(toEvent),
    notes: (no.data || []).map(toNote),
    documents: (doc.data || []).map(toDoc),
    precedents: (pr.data || []).map(toPrecedent),
    monthlyGoal: fs.data?.monthly_goal || 0,
  };
}

function toPayload(key, row) {
  if (key === "clients") return { name: row.name, type: row.type, email: row.email, phone: row.phone, cpf_cnpj: row.cpfCnpj || null, rg: row.rg || null, newsletter_opt_in: row.newsletterOptIn !== undefined ? row.newsletterOptIn : true, contact_type: row.contactType || "Cliente", address: row.address || null, nacionalidade: row.nacionalidade || null, estado_civil: row.estadoCivil || null, profissao: row.profissao || null, orgao_expedidor_rg: row.orgaoExpedidorRg || null, representante_legal: row.representanteLegal || null };
  if (key === "cases") return { title: row.title, client_id: row.clientId || null, number: row.number, area: row.area, status: row.status, case_type: row.caseType || "Judicial", tribunal: row.tribunal || null, comarca: row.comarca || null, instancia: row.instancia || null, vara: row.vara || null, tribunal_link: row.tribunalLink || null, judge_id: row.judgeId || null, balcao_virtual_link: row.balcaoVirtualLink || null, valor_causa: row.valorCausa || null, honorarios_contratuais: row.honorariosContratuais || null, honorarios_tipo: row.honorariosTipo || "fixo", condenacao_resultado: row.condenacaoResultado || null };
  if (key === "tasks") return { title: row.title, due_date: row.dueDate || null, done: row.done || false, case_id: row.caseId || null, notes: row.notes || null, completed_at: row.completedAt || null, recurrence_group: row.recurrenceGroup || null, source_note_id: row.sourceNoteId || null, time: row.time || null, location: row.location || null, google_synced: row.googleSynced || false };
  if (key === "appts") return { title: row.title, date: row.date, time: row.time, location: row.location, google_synced: row.googleSynced || false };
  if (key === "finance") return { description: row.description, amount: row.amount, type: row.type, date: row.date, client_id: row.clientId || null, case_id: row.caseId || null, bank_account: row.bankAccount || null, paid: !!row.settledAt, settled_at: row.settledAt || null, recurrence_group: row.recurrenceGroup || null };
  if (key === "events") return { case_id: row.caseId, event_date: row.date, description: row.description, notes: row.notes || null };
  if (key === "notes") return {
    case_id: row.caseId, note_date: row.date || todayISO(), content: row.content,
    type: row.type || "reuniao", author_id: row.authorId || null, author_name: row.authorName || null,
    occurred_at: row.occurredAt || row.date || todayISO(), pinned: row.pinned || false,
    participant_ids: row.participantIds || [], updated_at: row.updatedAt || null,
  };
  if (key === "precedents") return { judge_id: row.judgeId, description: row.description, drive_link: row.driveLink || null };
  if (key === "documents") return { case_id: row.caseId, name: row.name, drive_link: row.driveLink || null };
  return row;
}

async function insertRow(key, row) {
  const { data, error } = await supabase.from(TABLE_BY_KEY[key]).insert([toPayload(key, row)]).select();
  if (error) { console.error(error); return null; }
  return MAPPER_BY_KEY[key](data[0]);
}

async function deleteRow(key, id) {
  const { error } = await supabase.from(TABLE_BY_KEY[key]).delete().eq("id", id);
  if (error) console.error(error);
}

async function updateRow(key, id, patch) {
  const { error } = await supabase.from(TABLE_BY_KEY[key]).update(patch).eq("id", id);
  if (error) console.error(error);
}

async function editRow(key, id, row) {
  const { data, error } = await supabase.from(TABLE_BY_KEY[key]).update(toPayload(key, row)).eq("id", id).select();
  if (error) { console.error(error); return null; }
  return MAPPER_BY_KEY[key](data[0]);
}

// --- Tipos de consultoria (catálogo + vínculo muitos-para-muitos) ---
const toCaseType = (r) => ({ id: r.id, name: r.name, bg: r.bg_color, border: r.border_color });

async function fetchCaseTypesData() {
  const [catalogRes, linksRes] = await Promise.all([
    supabase.from("case_types").select("*").order("created_at"),
    supabase.from("case_case_types").select("case_id, case_types(id, name, bg_color, border_color)"),
  ]);
  const catalog = (catalogRes.data || []).map(toCaseType);
  const byCaseId = {};
  (linksRes.data || []).forEach((row) => {
    if (!row.case_types) return;
    const t = toCaseType(row.case_types);
    if (!byCaseId[row.case_id]) byCaseId[row.case_id] = [];
    byCaseId[row.case_id].push(t);
  });
  return { catalog, byCaseId };
}

async function createCaseType(name, existingCount) {
  const palette = CASE_TYPE_PALETTE[existingCount % CASE_TYPE_PALETTE.length];
  const { data, error } = await supabase.from("case_types").insert([{ name, bg_color: palette.bg, border_color: palette.border }]).select();
  if (error) { console.error(error); return null; }
  return toCaseType(data[0]);
}

async function linkCaseType(caseId, typeId) {
  const { error } = await supabase.from("case_case_types").insert([{ case_id: caseId, case_type_id: typeId }]);
  if (error) console.error(error);
}

async function unlinkCaseType(caseId, typeId) {
  const { error } = await supabase.from("case_case_types").delete().eq("case_id", caseId).eq("case_type_id", typeId);
  if (error) console.error(error);
}

function Logo({ dark = true, size = "normal" }) {
  const big = size === "big";
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: big ? 34 : 26, letterSpacing: big ? 8 : "0.34em", color: dark ? (big ? "#EDE6D8" : "#f0eadd") : NAVY }}>RSAC</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, margin: big ? "10px 0 8px" : "6px 0 4px" }}>
        <div style={{ width: big ? 60 : 36, height: 1, background: GOLD }} />
        <div style={{ width: 4, height: 4, borderRadius: 4, background: GOLD }} />
        <div style={{ width: big ? 60 : 36, height: 1, background: GOLD }} />
      </div>
      <div style={{ fontFamily: "Georgia, serif", fontSize: big ? 10 : 8, letterSpacing: big ? 2 : "0.2em", lineHeight: big ? "normal" : 1.6, color: dark ? (big ? "#9A917E" : "rgba(240,234,221,0.55)") : MUTED, marginTop: big ? 0 : 6 }}>
        RODRIGO SANTOS ADVOCACIA{big ? <br /> : " "}E CONSULTORIA
      </div>
      {big && (
        <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 12, color: "#EDE6D8", marginTop: 14 }}>
          Advocacia tributária e empresarial, com discrição.
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

const inputStyle = {
  width: "100%", border: "1px solid #E3E0D6", borderRadius: 6, padding: "8px 10px",
  fontSize: 14, color: INK, boxSizing: "border-box", fontFamily: "inherit",
};

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,42,67,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 12px", zIndex: 50 }}>
      <div style={{ background: CREAM, borderRadius: 10, padding: 24, width: "100%", maxWidth: 440, boxSizing: "border-box", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontFamily: "Georgia, serif", fontSize: 18, color: NAVY, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #EAE7DC", borderRadius: 10, padding: "16px 18px", flex: "1 1 140px", minWidth: 140 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: 12.5, color: MUTED }}>{label}</div>
        <Icon size={16} color={GOLD} />
      </div>
      <div style={{ fontFamily: "Georgia, serif", fontSize: 28, color: NAVY, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function Badge({ text }) {
  const c = STATUS_COLORS[text] || { bg: "#F1EFE8", text: "#444441" };
  return <span style={{ background: c.bg, color: c.text, fontSize: 12, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>{text}</span>;
}

function AddButton({ onClick }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, background: NAVY, color: "#EDE6D8", border: "none", borderRadius: 6, padding: "9px 16px", fontSize: 13, cursor: "pointer" }}>
      <Plus size={15} /> Adicionar
    </button>
  );
}

function ListPage({ title, subtitle, onAdd, children }) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: "Georgia, serif", color: NAVY, fontSize: 24, margin: "0 0 4px" }}>{title}</h1>
          <p style={{ color: MUTED, fontSize: 13.5, margin: 0 }}>{subtitle}</p>
        </div>
        <AddButton onClick={onAdd} />
      </div>
      {children}
    </>
  );
}

function SearchBar({ value, onChange, placeholder }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #EAE7DC", borderRadius: 6, padding: "8px 12px", marginBottom: 14, maxWidth: 320 }}>
      <Search size={15} color={MUTED} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ border: "none", outline: "none", fontSize: 13.5, flex: 1, fontFamily: "inherit" }} />
    </div>
  );
}

function RowCard({ title, subtitle, right, onDelete, onEdit, onClick }) {
  return (
    <div onClick={onClick} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: "1px solid #EAE7DC", borderRadius: 8, padding: "12px 14px", marginBottom: 8, gap: 10, cursor: onClick ? "pointer" : "default" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, color: INK, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 12, color: MUTED }}>{subtitle}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {right}
        {onEdit && <button onClick={(e) => { e.stopPropagation(); onEdit(); }} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }}><Pencil size={15} /></button>}
        {onDelete && <button onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#C0997B" }}><Trash2 size={15} /></button>}
      </div>
    </div>
  );
}

function DetailHeader({ onBack, title, subtitle, badge, onEdit, onDelete }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
      <div>
        <button onClick={onBack} style={{ background: "none", border: "none", color: MUTED, fontSize: 12.5, cursor: "pointer", padding: 0, marginBottom: 10 }}>← Voltar</button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ fontFamily: "Georgia, serif", color: NAVY, fontSize: 22, margin: 0 }}>{title}</h1>
          {badge}
        </div>
        {subtitle && <p style={{ color: MUTED, fontSize: 13, margin: "4px 0 0" }}>{subtitle}</p>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onEdit} style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #EAE7DC", borderRadius: 6, padding: "8px 14px", fontSize: 13, cursor: "pointer", color: NAVY }}>
          <Pencil size={14} /> Editar
        </button>
        <button onClick={onDelete} style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #EAE7DC", borderRadius: 6, padding: "8px 14px", fontSize: 13, cursor: "pointer", color: "#993D1D" }}>
          <Trash2 size={14} /> Excluir
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: "flex", padding: "8px 0", borderBottom: "1px solid #F1EFE8" }}>
      <div style={{ width: 120, fontSize: 12.5, color: MUTED, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 13.5, color: INK }}>{value || "—"}</div>
    </div>
  );
}

function EmailLink({ email }) {
  if (!email) return "—";
  const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`;
  return (
    <a href={url} target="_blank" rel="noreferrer" style={{ color: NAVY, textDecoration: "underline" }}>
      {email}
    </a>
  );
}

function InfoRowEmail({ label, value }) {
  return (
    <div style={{ display: "flex", padding: "8px 0", borderBottom: "1px solid #F1EFE8" }}>
      <div style={{ width: 120, fontSize: 12.5, color: MUTED, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 13.5, color: INK }}><EmailLink email={value} /></div>
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #EAE7DC", borderRadius: 10, padding: 18, marginBottom: 16 }}>
      <h3 style={{ fontFamily: "Georgia, serif", fontSize: 14.5, color: NAVY, margin: "0 0 12px" }}>{title}</h3>
      {children}
    </div>
  );
}

function CaseTypeTags({ types, catalog, onAdd, onRemove }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const typeIds = new Set((types || []).map((t) => t.id));
  const suggestions = (catalog || []).filter((t) => !typeIds.has(t.id) && t.name.toLowerCase().includes(query.trim().toLowerCase()));
  const canCreate = query.trim() && !(catalog || []).some((t) => t.name.toLowerCase() === query.trim().toLowerCase());

  const commitAdd = (name) => {
    if (!name.trim()) return;
    onAdd(name.trim());
    setQuery("");
    setOpen(false);
  };

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {(types || []).map((t) => (
        <span key={t.id} onClick={(e) => e.stopPropagation()} style={{
          position: "relative", display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 12, fontWeight: 600, color: "#12283f", background: t.bg, border: `1px solid ${t.border}`,
          borderRadius: 20, padding: "5px 11px",
        }} className="case-type-pill">
          {t.name}
          <span onClick={() => onRemove(t.id)} style={{ cursor: "pointer", opacity: 0.55, fontSize: 12, lineHeight: 1 }} title="Remover tipo">×</span>
        </span>
      ))}
      <span onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} style={{
        fontSize: 12, color: "#8a6d3b", border: "1px dashed #d6cdb8", borderRadius: 20, padding: "5px 11px", cursor: "pointer",
      }}>+ tipo</span>

      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 59 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: 60, minWidth: 220,
            background: "#fff", border: "1px solid #ddd6c8", borderRadius: 8, padding: 10,
            boxShadow: "0 8px 24px rgba(18,40,63,0.16)",
          }} onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitAdd(query); }}
              placeholder="Buscar ou criar tipo…"
              style={{ width: "100%", border: "1px solid #ddd6c8", borderRadius: 6, padding: "7px 9px", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
            />
            <div style={{ maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {suggestions.map((t) => (
                <div key={t.id} onClick={() => commitAdd(t.name)} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 7px", borderRadius: 6, cursor: "pointer", fontSize: 13,
                }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: t.bg, border: `1px solid ${t.border}` }} />
                  {t.name}
                </div>
              ))}
              {canCreate && (
                <div onClick={() => commitAdd(query)} style={{ padding: "6px 7px", borderRadius: 6, cursor: "pointer", fontSize: 13, color: "#8a6d3b" }}>
                  + Criar "{query.trim()}"
                </div>
              )}
              {!suggestions.length && !canCreate && (
                <div style={{ padding: "6px 7px", fontSize: 12.5, color: MUTED }}>Nenhum tipo disponível.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Empty({ text }) {
  return <p style={{ fontSize: 13.5, color: MUTED, background: "#fff", border: "1px dashed #DDD8C9", borderRadius: 8, padding: 20, textAlign: "center" }}>{text}</p>;
}

// --- Anotações do caso (composer, tipos, nota fixada, seleção de trecho -> tarefa) ---
const NOTE_TYPES = [
  { id: "reuniao", label: "Reunião", bg: "#e4e9ef" },
  { id: "ligacao", label: "Ligação", bg: "#e4efe6" },
  { id: "decisao", label: "Decisão", bg: "#f0e6ef" },
  { id: "diligencia", label: "Diligência", bg: "#f4ecd8" },
];
const noteTypeMeta = (id) => NOTE_TYPES.find((t) => t.id === id) || NOTE_TYPES[0];

function ParticipantPicker({ selectedIds, pool, onToggle }) {
  const [open, setOpen] = useState(false);
  const selected = pool.filter((p) => (selectedIds || []).includes(p.id));
  return (
    <div style={{ position: "relative", alignSelf: "flex-start" }}>
      <div onClick={() => setOpen((v) => !v)} style={{ fontSize: 12.5, color: NAVY, cursor: "pointer", border: "1px solid #E3E0D6", borderRadius: 6, padding: "6px 10px", display: "inline-block" }}>
        {selected.length ? `Participantes: ${selected.map((p) => p.name).join(", ")}` : "+ Participantes"}
      </div>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 59 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: 60, minWidth: 220, maxHeight: 220, overflowY: "auto",
            background: "#fff", border: "1px solid #ddd6c8", borderRadius: 8, padding: 8, boxShadow: "0 8px 24px rgba(18,40,63,0.16)",
          }} onClick={(e) => e.stopPropagation()}>
            {pool.length === 0 && <div style={{ fontSize: 12.5, color: MUTED, padding: 6 }}>Nenhum contato cadastrado.</div>}
            {pool.map((p) => (
              <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={(selectedIds || []).includes(p.id)} onChange={() => onToggle(p.id)} style={{ accentColor: GOLD }} />
                {p.name}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function NoteComposer({ onAdd, participantsPool }) {
  const [content, setContent] = useState("");
  const [type, setType] = useState("reuniao");
  const [participantIds, setParticipantIds] = useState([]);
  const [expanded, setExpanded] = useState(false);

  const submit = () => {
    if (!content.trim()) return;
    onAdd({ content: content.trim(), type, participantIds, date: todayISO() });
    setContent(""); setParticipantIds([]); setExpanded(false);
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #e6e0d2", borderRadius: 8, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      <textarea
        value={content} onChange={(e) => setContent(e.target.value)} onFocus={() => setExpanded(true)}
        placeholder="Escrever uma anotação…"
        style={{ border: "none", outline: "none", resize: "none", fontSize: 15, fontFamily: "inherit", minHeight: expanded ? 70 : 24, color: "#23201a" }}
      />
      {expanded && (
        <ParticipantPicker selectedIds={participantIds} pool={participantsPool} onToggle={(id) => setParticipantIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])} />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {NOTE_TYPES.map((t) => (
            <span key={t.id} onClick={() => setType(t.id)} style={{
              fontSize: 12.5, padding: "6px 12px", borderRadius: 20, cursor: "pointer",
              background: type === t.id ? t.bg : "#fff", color: type === t.id ? "#12283f" : "#6b6455",
              fontWeight: type === t.id ? 600 : 400, border: type === t.id ? "none" : "1px solid #ddd6c8",
            }}>{t.label}</span>
          ))}
        </div>
        <button onClick={submit} style={{ background: NAVY, color: "#fff", border: "none", borderRadius: 6, padding: "9px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>Salvar</button>
      </div>
    </div>
  );
}

function PinnedNoteCard({ note, onUnpin }) {
  return (
    <div style={{ background: "#fdf9ec", border: "1px solid #e6d9b4", borderRadius: 8, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#8a6d3b" }}>📌 FIXADA</span>
        <span onClick={onUnpin} style={{ fontSize: 12, color: "#8a6d3b", cursor: "pointer" }}>Desfixar</span>
      </div>
      <div style={{ fontSize: 12, color: "#857d6c" }}>atualizada em {fmtDateTime(note.updatedAt || note.occurredAt || note.date)} · {note.authorName || "—"}</div>
      <div style={{ fontSize: 15, lineHeight: 1.6, color: "#23201a", whiteSpace: "pre-wrap" }}>{note.content}</div>
    </div>
  );
}

function NoteCard({ note, participantsPool, onEdit, onDelete, onTogglePin, onCreateTask, derivedTaskCount }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(note.content);
  const [selMenu, setSelMenu] = useState(null);
  const meta = noteTypeMeta(note.type);
  const participants = participantsPool.filter((p) => (note.participantIds || []).includes(p.id));
  const edited = note.updatedAt && note.createdAt && note.updatedAt > note.createdAt;

  const handleMouseUp = (e) => {
    if (editing) return;
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : "";
    if (text.length > 0) setSelMenu({ text, x: e.clientX, y: e.clientY });
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #e6e0d2", borderRadius: 8, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 11, position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: meta.bg, color: "#12283f" }}>{meta.label}</span>
          <span style={{ fontSize: 13, color: "#857d6c" }}>
            {fmtDateTime(note.occurredAt || note.date)} · {note.authorName || "—"}{edited ? " · editada" : ""}
          </span>
        </div>
        <div style={{ display: "flex", gap: 12, color: "#b8b0a0", flexShrink: 0 }}>
          <span onClick={() => onTogglePin(note)} title={note.pinned ? "Desfixar" : "Fixar"} style={{ cursor: "pointer" }}>📌</span>
          <span onClick={() => setEditing((v) => !v)} title="Editar" style={{ cursor: "pointer" }}>✎</span>
          <span onClick={() => onDelete(note.id)} title="Excluir" style={{ cursor: "pointer" }}><Trash2 size={14} /></span>
        </div>
      </div>

      {editing ? (
        <>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} style={{ fontSize: 15, lineHeight: 1.6, border: "1px solid #ddd6c8", borderRadius: 6, padding: "8px 10px", minHeight: 80, fontFamily: "inherit", resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => { setEditing(false); setContent(note.content); }} style={{ background: "none", border: "1px solid #E3E0D6", borderRadius: 6, padding: "7px 14px", fontSize: 12.5, cursor: "pointer", color: MUTED }}>Cancelar</button>
            <button onClick={() => { onEdit(note.id, { content }); setEditing(false); }} style={{ background: NAVY, color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 12.5, cursor: "pointer" }}>Salvar</button>
          </div>
        </>
      ) : (
        <div onMouseUp={handleMouseUp} style={{ fontSize: 15, lineHeight: 1.6, color: "#23201a", whiteSpace: "pre-wrap" }}>{note.content}</div>
      )}

      {(participants.length > 0 || derivedTaskCount > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 12, color: "#857d6c" }}>
          {participants.length > 0 && <span>Participantes: {participants.map((p) => p.name).join(", ")}</span>}
          {derivedTaskCount > 0 && (
            <span style={{ fontWeight: 600, color: "#12283f", background: "#f4ecd8", borderRadius: 20, padding: "3px 10px" }}>
              {derivedTaskCount} tarefa{derivedTaskCount > 1 ? "s" : ""} criada{derivedTaskCount > 1 ? "s" : ""} daqui
            </span>
          )}
        </div>
      )}

      {selMenu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 69 }} onClick={() => setSelMenu(null)} />
          <button onClick={() => { onCreateTask(note, selMenu.text); setSelMenu(null); window.getSelection()?.removeAllRanges(); }} style={{
            position: "fixed", left: selMenu.x, top: selMenu.y - 38, zIndex: 70,
            background: "#12283f", color: "#fff", border: "none", borderRadius: 6, padding: "7px 12px", fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap",
          }}>+ Criar tarefa</button>
        </>
      )}
    </div>
  );
}

function NotesPanel({ notes, participantsPool, tasks, onAdd, onEdit, onDelete, onTogglePin, onCreateTaskFromNote }) {
  const [typeFilter, setTypeFilter] = useState("todas");
  const [search, setSearch] = useState("");

  const pinned = notes.find((n) => n.pinned);
  const rest = notes
    .filter((n) => !n.pinned)
    .filter((n) => typeFilter === "todas" || n.type === typeFilter)
    .filter((n) => !search.trim() || n.content.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => (b.occurredAt || b.date || "").localeCompare(a.occurredAt || a.date || ""));

  const derivedCount = (noteId) => (tasks || []).filter((t) => t.sourceNoteId === noteId).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <NoteComposer onAdd={onAdd} participantsPool={participantsPool} />
      {pinned && <PinnedNoteCard note={pinned} onUnpin={() => onTogglePin(pinned)} />}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span onClick={() => setTypeFilter("todas")} style={{ fontSize: 12.5, padding: "5px 11px", borderRadius: 20, cursor: "pointer", background: typeFilter === "todas" ? "#e8e1d2" : "#fff", border: "1px solid #ddd6c8", fontWeight: typeFilter === "todas" ? 600 : 400 }}>Todas</span>
        {NOTE_TYPES.map((t) => (
          <span key={t.id} onClick={() => setTypeFilter(t.id)} style={{ fontSize: 12.5, padding: "5px 11px", borderRadius: 20, cursor: "pointer", background: typeFilter === t.id ? "#e8e1d2" : "#fff", border: "1px solid #ddd6c8", fontWeight: typeFilter === t.id ? 600 : 400 }}>{t.label}</span>
        ))}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nas anotações" style={{ marginLeft: "auto", fontSize: 12.5, border: "1px solid #ddd6c8", borderRadius: 6, padding: "6px 10px", minWidth: 160 }} />
      </div>
      {rest.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhuma anotação encontrada.</p>}
      {rest.map((n) => (
        <NoteCard key={n.id} note={n} participantsPool={participantsPool} onEdit={onEdit} onDelete={onDelete} onTogglePin={onTogglePin} onCreateTask={onCreateTaskFromNote} derivedTaskCount={derivedCount(n.id)} />
      ))}
    </div>
  );
}

function SubmitRow({ onClose, onSubmit, submitLabel }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
      <button onClick={onClose} style={{ background: "none", border: "1px solid #E3E0D6", borderRadius: 6, padding: "9px 16px", fontSize: 13, cursor: "pointer", color: MUTED }}>Cancelar</button>
      <button onClick={onSubmit} style={{ background: NAVY, color: "#EDE6D8", border: "none", borderRadius: 6, padding: "9px 16px", fontSize: 13, cursor: "pointer" }}>{submitLabel || "Salvar"}</button>
    </div>
  );
}

function FormLayer({ modal, onClose, clients, cases, editing, prefill, taskCaseId, taskPrefill, financeContext, onAddClient, onEditClient, onAddCase, onEditCase, onAddTask, onEditTask, onAddTaskRecurring, onAddFinance, onEditFinance, onAddFinanceRecurring, onAddEvent, onAddNote, onAddDoc, onAddPrecedent }) {
  const [error, setError] = useState("");

  if (modal === "client") {
    const src = editing || prefill;
    const [name, setName] = useState(src?.name || ""); const [type, setType] = useState(src?.type || "PF");
    const [email, setEmail] = useState(src?.email || ""); const [phone, setPhone] = useState(src?.phone || "");
    const [cpfCnpj, setCpfCnpj] = useState(src?.cpfCnpj || ""); const [rg, setRg] = useState(src?.rg || "");
    const [contactType, setContactType] = useState(src?.contactType || "Cliente");
    const [address, setAddress] = useState(src?.address || "");
    const [nacionalidade, setNacionalidade] = useState(src?.nacionalidade || "brasileiro(a)");
    const [estadoCivil, setEstadoCivil] = useState(src?.estadoCivil || "");
    const [profissao, setProfissao] = useState(src?.profissao || "");
    const [orgaoExpedidorRg, setOrgaoExpedidorRg] = useState(src?.orgaoExpedidorRg || "");
    const [representanteLegal, setRepresentanteLegal] = useState(src?.representanteLegal || "");
    return (
      <Modal title={editing ? "Editar contato" : "Novo contato"} onClose={onClose}>
        <Field label="Nome"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo ou razão social" /></Field>
        <Field label="Tipo de contato">
          <div style={{ display: "flex", gap: 8 }}>
            {["Cliente", "Colaborador", "Parte contrária", "Juiz"].map((t) => (
              <div key={t} onClick={() => setContactType(t)} style={{
                flex: 1, textAlign: "center", padding: "8px 6px", borderRadius: 6, cursor: "pointer",
                border: contactType === t ? "1.5px solid #B08D57" : "1px solid #E3E0D6",
                background: contactType === t ? "rgba(176,141,87,0.1)" : "#fff",
                fontSize: 12.5, color: contactType === t ? NAVY : MUTED,
              }}>{t}</div>
            ))}
          </div>
        </Field>
        <Field label="Tipo"><select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}><option value="PF">Pessoa física</option><option value="PJ">Pessoa jurídica</option></select></Field>
        <Field label={type === "PJ" ? "CNPJ" : "CPF"}>
          <input style={inputStyle} value={cpfCnpj} onChange={(e) => setCpfCnpj(e.target.value)} placeholder={type === "PJ" ? "00.000.000/0000-00" : "000.000.000-00"} />
        </Field>
        {type === "PF" ? (
          <>
            <Field label="RG"><input style={inputStyle} value={rg} onChange={(e) => setRg(e.target.value)} placeholder="00.000.000-0" /></Field>
            <Field label="Órgão expedidor do RG"><input style={inputStyle} value={orgaoExpedidorRg} onChange={(e) => setOrgaoExpedidorRg(e.target.value)} placeholder="Ex: SSP/SP" /></Field>
            <Field label="Nacionalidade"><input style={inputStyle} value={nacionalidade} onChange={(e) => setNacionalidade(e.target.value)} placeholder="Ex: brasileiro(a)" /></Field>
            <Field label="Estado civil"><input style={inputStyle} value={estadoCivil} onChange={(e) => setEstadoCivil(e.target.value)} placeholder="Ex: casado(a)" /></Field>
            <Field label="Profissão"><input style={inputStyle} value={profissao} onChange={(e) => setProfissao(e.target.value)} placeholder="Ex: empresário(a)" /></Field>
          </>
        ) : (
          <Field label="Representante legal"><input style={inputStyle} value={representanteLegal} onChange={(e) => setRepresentanteLegal(e.target.value)} placeholder="Nome e qualificação do representante" /></Field>
        )}
        <Field label="E-mail"><input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@exemplo.com" /></Field>
        <Field label="Telefone"><input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 90000-0000" /></Field>
        <Field label="Endereço"><input style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua, número, bairro, cidade – UF" /></Field>
        {error && <div style={{ color: "#993D1D", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <SubmitRow onClose={onClose} onSubmit={() => {
          if (!name.trim()) { setError("Informe o nome do cliente."); return; }
          const values = { name: name.trim(), type, email, phone, cpfCnpj, rg: type === "PF" ? rg : "", contactType, address, nacionalidade, estadoCivil, profissao, orgaoExpedidorRg, representanteLegal };
          if (editing) onEditClient(editing.id, values); else onAddClient(values);
        }} />
      </Modal>
    );
  }

  if (modal === "case") {
    const [title, setTitle] = useState(editing?.title || ""); const [clientId, setClientId] = useState(editing?.clientId || clients[0]?.id || "");
    const [number, setNumber] = useState(editing?.number || ""); const [area, setArea] = useState(editing?.area || ""); const [status, setStatus] = useState(editing?.status || "Ativo");
    const [caseType, setCaseType] = useState(editing?.caseType || "Judicial");
    const [tribunal, setTribunal] = useState(editing?.tribunal || ""); const [comarca, setComarca] = useState(editing?.comarca || "");
    const [instancia, setInstancia] = useState(editing?.instancia || ""); const [vara, setVara] = useState(editing?.vara || "");
    const [tribunalLink, setTribunalLink] = useState(editing?.tribunalLink || "");
    const [balcaoVirtualLink, setBalcaoVirtualLink] = useState(editing?.balcaoVirtualLink || "");
    const [valorCausa, setValorCausa] = useState(editing?.valorCausa || "");
    const [honorariosContratuais, setHonorariosContratuais] = useState(editing?.honorariosContratuais || "");
    const [honorariosTipo, setHonorariosTipo] = useState(editing?.honorariosTipo || "fixo");
    const [condenacaoResultado, setCondenacaoResultado] = useState(editing?.condenacaoResultado || "");
    const [judgeId, setJudgeId] = useState(editing?.judgeId || "");
    const judges = sortByName(clients.filter((c) => c.contactType === "Juiz"));
    return (
      <Modal title={editing ? "Editar caso" : "Novo caso"} onClose={onClose}>
        <Field label="Título do caso"><input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Planejamento sucessório" /></Field>
        <Field label="Cliente"><select style={inputStyle} value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">Selecionar…</option>{sortByName(clients).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Natureza do caso">
          <div style={{ display: "flex", gap: 8 }}>
            {["Consultoria", "Judicial"].map((t) => (
              <div key={t} onClick={() => setCaseType(t)} style={{
                flex: 1, textAlign: "center", padding: "8px 6px", borderRadius: 6, cursor: "pointer",
                border: caseType === t ? "1.5px solid #B08D57" : "1px solid #E3E0D6",
                background: caseType === t ? "rgba(176,141,87,0.1)" : "#fff",
                fontSize: 13, color: caseType === t ? NAVY : MUTED,
              }}>{t}</div>
            ))}
          </div>
        </Field>
        {caseType === "Judicial" && (
          <>
            <Field label="Tribunal"><input style={inputStyle} value={tribunal} onChange={(e) => setTribunal(e.target.value)} placeholder="Ex: TJ-SP" /></Field>
            <Field label="Comarca"><input style={inputStyle} value={comarca} onChange={(e) => setComarca(e.target.value)} placeholder="Ex: São Paulo" /></Field>
            <Field label="Instância"><input style={inputStyle} value={instancia} onChange={(e) => setInstancia(e.target.value)} placeholder="Ex: 1ª" /></Field>
            <Field label="Vara"><input style={inputStyle} value={vara} onChange={(e) => setVara(e.target.value)} placeholder="Ex: 1ª Vara Cível" /></Field>
            <Field label="Juiz responsável">
              <select style={inputStyle} value={judgeId} onChange={(e) => setJudgeId(e.target.value)}>
                <option value="">Selecionar…</option>
                {judges.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
              </select>
              {judges.length === 0 && <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>Nenhum contato do tipo Juiz cadastrado ainda. Crie um em Contatos.</div>}
            </Field>
            <Field label="Link de consulta processual (opcional)"><input style={inputStyle} value={tribunalLink} onChange={(e) => setTribunalLink(e.target.value)} placeholder="https://..." /></Field>
            <Field label="Balcão virtual da vara (opcional)"><input style={inputStyle} value={balcaoVirtualLink} onChange={(e) => setBalcaoVirtualLink(e.target.value)} placeholder="https://..." /></Field>
            <Field label="Valor da causa (R$, opcional)"><input type="number" step="0.01" style={inputStyle} value={valorCausa} onChange={(e) => setValorCausa(e.target.value)} placeholder="0,00" /></Field>
            <Field label="Tipo de honorários contratuais">
              <div style={{ display: "flex", gap: 8 }}>
                {[{ v: "fixo", l: "Valor fixo (R$)" }, { v: "percentual", l: "Percentual (%)" }].map((o) => (
                  <div key={o.v} onClick={() => setHonorariosTipo(o.v)} style={{
                    flex: 1, textAlign: "center", padding: "8px 6px", borderRadius: 6, cursor: "pointer",
                    border: honorariosTipo === o.v ? "1.5px solid #B08D57" : "1px solid #E3E0D6",
                    background: honorariosTipo === o.v ? "rgba(176,141,87,0.1)" : "#fff",
                    fontSize: 12.5, color: honorariosTipo === o.v ? NAVY : MUTED,
                  }}>{o.l}</div>
                ))}
              </div>
            </Field>
            <Field label={honorariosTipo === "percentual" ? "Honorários contratuais (%, opcional)" : "Honorários contratuais (R$, opcional)"}>
              <input type="number" step="0.01" style={inputStyle} value={honorariosContratuais} onChange={(e) => setHonorariosContratuais(e.target.value)} placeholder={honorariosTipo === "percentual" ? "Ex: 20" : "0,00"} />
            </Field>
            <Field label="Condenação / Resultado (R$, opcional)"><input type="number" step="0.01" style={inputStyle} value={condenacaoResultado} onChange={(e) => setCondenacaoResultado(e.target.value)} placeholder="0,00" /></Field>
          </>
        )}
        {caseType === "Consultoria" ? (
          <Field label="Número">
            <div style={{ ...inputStyle, background: "#F1EFE8", color: MUTED, display: "flex", alignItems: "center" }}>
              {editing?.number || "Gerado automaticamente (NNNN/AAAA) ao salvar"}
            </div>
          </Field>
        ) : (
          <Field label="Número do processo (opcional)"><input style={inputStyle} value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
        )}
        <Field label="Área"><input style={inputStyle} value={area} onChange={(e) => setArea(e.target.value)} placeholder="Tributário, empresarial…" /></Field>
        <Field label="Status"><select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}><option>Ativo</option><option>Suspenso</option><option>Encerrado</option></select></Field>
        {error && <div style={{ color: "#993D1D", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <SubmitRow onClose={onClose} onSubmit={() => {
          if (!title.trim()) { setError("Informe o título do caso."); return; }
          const values = { title: title.trim(), clientId, number, area, status, caseType, tribunal, comarca, instancia, vara, tribunalLink, judgeId, balcaoVirtualLink, valorCausa: valorCausa ? Number(valorCausa) : null, honorariosContratuais: honorariosContratuais ? Number(honorariosContratuais) : null, honorariosTipo, condenacaoResultado: condenacaoResultado ? Number(condenacaoResultado) : null };
          if (editing) onEditCase(editing.id, values); else onAddCase(values);
        }} />
      </Modal>
    );
  }

  if (modal === "task") {
    const [title, setTitle] = useState(editing?.title || taskPrefill?.title || ""); const [dueDate, setDueDate] = useState(editing?.dueDate || "");
    const [time, setTime] = useState(editing?.time || "");
    const [location, setLocation] = useState(editing?.location || "");
    const [notes, setNotes] = useState(editing?.notes || "");
    const [caseId, setCaseId] = useState(editing?.caseId || taskCaseId || "");
    const [recurrent, setRecurrent] = useState(false);
    const [every, setEvery] = useState(1);
    const [unit, setUnit] = useState("month");
    const [times, setTimes] = useState(2);
    return (
      <Modal title={editing ? "Editar tarefa" : taskCaseId ? "Nova tarefa do caso" : "Nova tarefa"} onClose={onClose}>
        <Field label="Descrição"><input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Protocolar manifestação" /></Field>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><Field label="Data"><input type="date" style={inputStyle} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field></div>
          <div style={{ flex: 1 }}><Field label="Hora (opcional)"><input type="time" style={inputStyle} value={time} onChange={(e) => setTime(e.target.value)} /></Field></div>
        </div>
        {dueDate && (
          <div style={{ background: "#F7F3E8", border: "1px solid #E6D9B4", borderRadius: 6, padding: "10px 12px", fontSize: 12.5, color: "#6b5a2e", marginBottom: 12 }}>
            {time
              ? `Com hora preenchida, entra na Agenda como compromisso de 1h em ${fmtDate(dueDate)}.`
              : "Sem hora, entra como item do dia — não aparece com horário marcado na Agenda."}
          </div>
        )}
        {time && (
          <Field label="Local (opcional)"><input style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex: Escritório, sala de reunião" /></Field>
        )}
        {editing && (
          <Field label="Caso vinculado (opcional)">
            <select style={inputStyle} value={caseId} onChange={(e) => setCaseId(e.target.value)}>
              <option value="">— Sem caso vinculado —</option>
              {cases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </Field>
        )}
        <Field label="Solução (opcional)"><textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "inherit" }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="O que foi feito para resolver…" /></Field>
        {!editing && dueDate && (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 13, color: INK }}>
              <input type="checkbox" checked={recurrent} onChange={(e) => setRecurrent(e.target.checked)} style={{ width: 15, height: 15, accentColor: GOLD }} />
              Recorrente
            </label>
            {recurrent && (
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <Field label="Repetir a cada">
                    <input type="number" min="1" style={inputStyle} value={every} onChange={(e) => setEvery(e.target.value)} />
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Frequência">
                    <select style={inputStyle} value={unit} onChange={(e) => setUnit(e.target.value)}>
                      <option value="day">Dia(s)</option>
                      <option value="week">Semana(s)</option>
                      <option value="month">Mês(es)</option>
                    </select>
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Quantas vezes">
                    <input type="number" min="2" style={inputStyle} value={times} onChange={(e) => setTimes(e.target.value)} />
                  </Field>
                </div>
              </div>
            )}
          </>
        )}
        {error && <div style={{ color: "#993D1D", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <SubmitRow onClose={onClose} onSubmit={() => {
          if (!title.trim()) { setError("Descreva a tarefa."); return; }
          const base = { title: title.trim(), dueDate, time: time || null, location: time ? (location || null) : null, notes, caseId: editing ? (caseId || null) : (taskCaseId || null), sourceNoteId: editing ? editing.sourceNoteId : (taskPrefill?.sourceNoteId || null) };
          if (editing) { onEditTask(editing.id, base); return; }
          if (recurrent && dueDate && Number(times) > 1) onAddTaskRecurring(base, Number(every), unit, Number(times));
          else onAddTask(base);
        }} />
      </Modal>
    );
  }

  if (modal === "finance") {
    const [description, setDescription] = useState(editing?.description || ""); const [amount, setAmount] = useState(editing?.amount || "");
    const [type, setType] = useState(editing?.type || financeContext?.presetType || "Receita"); const [date, setDate] = useState(editing?.date || todayISO());
    const [clientId, setClientId] = useState(editing?.clientId || financeContext?.clientId || "");
    const [caseId, setCaseId] = useState(editing?.caseId || financeContext?.caseId || "");
    const [bankAccount, setBankAccount] = useState(editing?.bankAccount || "");
    const [settled, setSettled] = useState(editing ? !!editing.settledAt : false);
    const [settledAt, setSettledAt] = useState(editing?.settledAt || todayISO());
    const [recurrent, setRecurrent] = useState(false);
    const [months, setMonths] = useState(2);
    return (
      <Modal title={editing ? "Editar lançamento" : financeContext?.presetType === "Despesa" ? "Nova despesa processual" : financeContext?.presetType === "Receita" ? "Novo pagamento do cliente" : "Novo lançamento"} onClose={onClose}>
        <Field label="Descrição"><input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Honorário — caso X" /></Field>
        <Field label="Tipo"><select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}><option>Receita</option><option>Despesa</option></select></Field>
        <Field label="Valor (R$)"><input type="number" step="0.01" style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></Field>
        <Field label="Vencimento"><input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Forma de pagamento (opcional)"><input style={inputStyle} value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="Ex: PIX - BTG, Boleto Escritório" /></Field>
        <Field label="Cliente (opcional)"><select style={inputStyle} value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">—</option>{sortByName(clients).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Caso vinculado (opcional)"><select style={inputStyle} value={caseId} onChange={(e) => setCaseId(e.target.value)}><option value="">—</option>{cases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></Field>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: settled ? 10 : 14, fontSize: 13, color: INK }}>
          <input type="checkbox" checked={settled} onChange={(e) => setSettled(e.target.checked)} style={{ width: 15, height: 15, accentColor: GOLD }} />
          {type === "Despesa" ? "Já foi pago" : "Já foi recebido"}
        </label>
        {settled && (
          <Field label="Data da liquidação"><input type="date" style={inputStyle} value={settledAt} onChange={(e) => setSettledAt(e.target.value)} /></Field>
        )}
        {!editing && (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 13, color: INK }}>
              <input type="checkbox" checked={recurrent} onChange={(e) => setRecurrent(e.target.checked)} style={{ width: 15, height: 15, accentColor: GOLD }} />
              Recorrente
            </label>
            {recurrent && (
              <Field label="Repetir por quantos meses (incluindo este)">
                <input type="number" min="2" style={inputStyle} value={months} onChange={(e) => setMonths(e.target.value)} />
              </Field>
            )}
          </>
        )}
        {error && <div style={{ color: "#993D1D", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <SubmitRow onClose={onClose} onSubmit={() => {
          if (!description.trim() || !amount) { setError("Informe descrição e valor."); return; }
          const base = { description: description.trim(), amount: Number(amount), type, date, clientId, caseId: caseId || null, bankAccount, settledAt: settled ? settledAt : null };
          if (editing) { onEditFinance(editing.id, base); return; }
          if (recurrent && Number(months) > 1) onAddFinanceRecurring(base, Number(months));
          else onAddFinance(base);
        }} />
      </Modal>
    );
  }

  if (modal === "event") {
    const [date, setDate] = useState(todayISO()); const [description, setDescription] = useState("");
    const [notes, setNotes] = useState("");
    return (
      <Modal title="Novo evento na timeline" onClose={onClose}>
        <Field label="Data"><input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Descrição"><input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Juntada de petição" /></Field>
        <Field label="Notas / pontos importantes (opcional)"><textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "inherit" }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalhes que valem ser lembrados…" /></Field>
        {error && <div style={{ color: "#993D1D", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <SubmitRow onClose={onClose} onSubmit={() => { if (!description.trim()) { setError("Descreva o evento."); return; } onAddEvent({ caseId: taskCaseId, date, description: description.trim(), notes }); }} />
      </Modal>
    );
  }

  if (modal === "note") {
    const [date, setDate] = useState(todayISO()); const [content, setContent] = useState("");
    return (
      <Modal title="Nova anotação" onClose={onClose}>
        <Field label="Data"><input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Anotação"><textarea style={{ ...inputStyle, minHeight: 100, resize: "vertical", fontFamily: "inherit" }} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Escreva a anotação…" /></Field>
        {error && <div style={{ color: "#993D1D", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <SubmitRow onClose={onClose} onSubmit={() => { if (!content.trim()) { setError("Escreva a anotação."); return; } onAddNote({ caseId: taskCaseId, date, content: content.trim() }); }} />
      </Modal>
    );
  }

  if (modal === "document") {
    const [name, setName] = useState(""); const [driveLink, setDriveLink] = useState("");
    return (
      <Modal title="Novo documento" onClose={onClose}>
        <Field label="Nome do documento"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Petição inicial" /></Field>
        <Field label="Link no Google Drive (opcional)"><input style={inputStyle} value={driveLink} onChange={(e) => setDriveLink(e.target.value)} placeholder="https://drive.google.com/..." /></Field>
        {error && <div style={{ color: "#993D1D", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <SubmitRow onClose={onClose} onSubmit={() => { if (!name.trim()) { setError("Informe o nome do documento."); return; } onAddDoc({ caseId: taskCaseId, name: name.trim(), driveLink }); }} />
      </Modal>
    );
  }

  if (modal === "precedent") {
    const [description, setDescription] = useState(""); const [driveLink, setDriveLink] = useState("");
    return (
      <Modal title="Nova sentença/jurisprudência" onClose={onClose}>
        <Field label="Descrição"><input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Natureza securitária do VGBL" /></Field>
        <Field label="Link no Google Drive (opcional)"><input style={inputStyle} value={driveLink} onChange={(e) => setDriveLink(e.target.value)} placeholder="https://drive.google.com/..." /></Field>
        {error && <div style={{ color: "#993D1D", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <SubmitRow onClose={onClose} onSubmit={() => { if (!description.trim()) { setError("Descreva a sentença/jurisprudência."); return; } onAddPrecedent({ judgeId: taskCaseId, description: description.trim(), driveLink }); }} />
      </Modal>
    );
  }

  return null;
}

function LoginScreen({ onClientPortalAccess }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [info, setInfo] = useState(""); const [busy, setBusy] = useState(false);

  const [portalCode, setPortalCode] = useState(""); const [portalError, setPortalError] = useState(""); const [portalBusy, setPortalBusy] = useState(false);

  const [publicNews, setPublicNews] = useState([]);

  useEffect(() => {
    supabase.from("newsletters").select("subject, html_body, scheduled_for")
      .eq("sent", true).order("scheduled_for", { ascending: false }).limit(3)
      .then(({ data }) => setPublicNews(data || []));
  }, []);

  const submit = async () => {
    setError(""); setInfo("");
    if (!email.trim() || !password) { setError("Informe e-mail e senha."); return; }
    setBusy(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) setError(error.message);
      else setInfo("Conta criada. Se a confirmação por e-mail estiver ativa no seu projeto, verifique a caixa de entrada antes de entrar.");
    }
    setBusy(false);
  };

  const submitPortal = async () => {
    setPortalError("");
    if (!portalCode.trim()) { setPortalError("Informe o código de acesso."); return; }
    setPortalBusy(true);
    try {
      const resp = await fetch("https://jrcojsnjxuykdczbqfuo.supabase.co/functions/v1/client-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_code: portalCode.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) { setPortalError(data.error || "Código de acesso inválido."); setPortalBusy(false); return; }
      onClientPortalAccess(data);
    } catch (e) {
      setPortalError("Não foi possível conectar. Tente novamente.");
    }
    setPortalBusy(false);
  };

  return (
    <div style={{ background: NAVY, borderRadius: 10, padding: "28px 16px 20px" }}>
      <div style={{ marginBottom: 24 }}><Logo dark size="big" /></div>

      <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ background: CREAM, borderRadius: 10, padding: "24px 22px", flex: "1 1 260px", maxWidth: 300, boxSizing: "border-box" }}>
          <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 1, textAlign: "center", marginBottom: 14 }}>Acesso da equipe</div>
          <Field label="E-mail"><input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@rsac.com.br" /></Field>
          <Field label="Senha"><input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></Field>
          {error && <div style={{ color: "#993D1D", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
          {info && <div style={{ color: "#27500A", fontSize: 12.5, marginBottom: 10 }}>{info}</div>}
          <button onClick={submit} disabled={busy} style={{ width: "100%", background: NAVY, color: "#EDE6D8", border: "none", borderRadius: 6, padding: "10px 16px", fontSize: 14, cursor: "pointer", marginTop: 4 }}>
            {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
          <div style={{ textAlign: "center", marginTop: 14, fontSize: 12.5, color: MUTED }}>
            {mode === "login" ? (
              <>Ainda não tem conta? <a href="#" onClick={(e) => { e.preventDefault(); setMode("signup"); setError(""); setInfo(""); }} style={{ color: NAVY }}>Criar acesso</a></>
            ) : (
              <>Já tem conta? <a href="#" onClick={(e) => { e.preventDefault(); setMode("login"); setError(""); setInfo(""); }} style={{ color: NAVY }}>Entrar</a></>
            )}
          </div>
        </div>

        <div style={{ background: "#12233A", border: "1px solid #2A4560", borderRadius: 10, padding: "24px 22px", flex: "1 1 260px", maxWidth: 300, boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 16, color: "#EDE6D8", textAlign: "center", marginBottom: 4 }}>Portal do cliente</div>
          <div style={{ fontSize: 11, color: "#9FB0BE", textAlign: "center", marginBottom: 18 }}>Acompanhe seus casos e processos</div>
          <Field label={<span style={{ color: "#B9C2CC" }}>Código de acesso</span>}>
            <input style={inputStyle} value={portalCode} onChange={(e) => setPortalCode(e.target.value)} placeholder="Ex: a1b2c3d4" />
          </Field>
          {portalError && <div style={{ color: "#E39C8A", fontSize: 12.5, marginBottom: 10 }}>{portalError}</div>}
          <button onClick={submitPortal} disabled={portalBusy} style={{ width: "100%", background: GOLD, color: "#0F2A43", border: "none", borderRadius: 6, padding: "10px 16px", fontSize: 14, cursor: "pointer", marginTop: 4, fontWeight: 600 }}>
            {portalBusy ? "Verificando…" : "Acessar meus casos"}
          </button>
        </div>
      </div>

      {publicNews.length > 0 && (
        <div style={{ background: CREAM, borderRadius: 10, padding: "18px 20px", maxWidth: 620, margin: "0 auto" }}>
          <div style={{ fontSize: 11, letterSpacing: 1, color: MUTED, textTransform: "uppercase", borderBottom: "1px solid #EAE7DC", paddingBottom: 10, marginBottom: 10 }}>
            Newsletter — últimas notícias
          </div>
          {publicNews.map((n, i) => {
            const snippet = (n.html_body || "").split("\n").find((l) => l.trim()) || "";
            return (
              <div key={i} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: i === publicNews.length - 1 ? "none" : "1px solid #F1EFE8" }}>
                <div style={{ width: 4, background: GOLD, borderRadius: 2, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, color: NAVY, fontWeight: 600 }}>{n.subject}</div>
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{snippet.slice(0, 110)}{snippet.length > 110 ? "…" : ""}</div>
                  <div style={{ fontSize: 10.5, color: "#9A917E", marginTop: 3 }}>{fmtDate(n.scheduled_for)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClientFolder({ client, cases, finance, precedents, onBack, onEdit, onDelete, onOpenCase, onToggleOptIn, onAddPrecedent, onDeletePrecedent }) {
  const linkedCases = cases.filter((c) => c.clientId === client.id);
  const judgeCases = cases.filter((c) => c.judgeId === client.id);
  const linkedFinance = finance.filter((f) => f.clientId === client.id);
  const myPrecedents = (precedents || []).filter((p) => p.judgeId === client.id);
  const optedIn = client.newsletterOptIn !== false;
  const isJudge = client.contactType === "Juiz";
  const [showProcuracao, setShowProcuracao] = useState(false);
  const [procCidade, setProcCidade] = useState("São Paulo");
  const [procData, setProcData] = useState(todayISO());
  const [procBusy, setProcBusy] = useState(false);
  const [procError, setProcError] = useState("");
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const gerarProcuracao = async () => {
    setProcBusy(true); setProcError("");
    try {
      const d = new Date(procData + "T00:00:00");
      await generateProcuracao(client, { cidade: procCidade, dia: String(d.getDate()), mes: MESES[d.getMonth()], ano: String(d.getFullYear()) });
      setShowProcuracao(false);
    } catch (e) {
      setProcError(e.message || "Não foi possível gerar a procuração.");
    }
    setProcBusy(false);
  };
  return (
    <>
      <DetailHeader onBack={onBack} title={client.name}
        badge={<span style={{ display: "flex", gap: 6 }}>
          <span style={{ fontSize: 11, background: "#F1EFE8", color: MUTED, padding: "2px 9px", borderRadius: 12 }}>{client.contactType || "Cliente"}</span>
          <span style={{ fontSize: 11, background: "#F1EFE8", color: MUTED, padding: "2px 9px", borderRadius: 12 }}>{client.type === "PJ" ? "Pessoa jurídica" : "Pessoa física"}</span>
        </span>}
        onEdit={onEdit} onDelete={onDelete} />
      <SectionCard title="Dados cadastrais">
        <InfoRow label={client.type === "PJ" ? "CNPJ" : "CPF"} value={client.cpfCnpj} />
        {client.type === "PF" && <InfoRow label="RG" value={client.rg} />}
        <InfoRowEmail label="E-mail" value={client.email} />
        <InfoRow label="Telefone" value={client.phone} />
        <InfoRow label="Endereço" value={client.address} />
      </SectionCard>
      {!isJudge && (
        <SectionCard title="Documentos">
          <button onClick={() => setShowProcuracao(true)} style={{ background: "#fff", border: "1px solid #E3E0D6", borderRadius: 6, padding: "9px 14px", fontSize: 13, color: NAVY, cursor: "pointer" }}>
            Criar procuração (Word)
          </button>
        </SectionCard>
      )}
      {client.contactType === "Cliente" && (
        <SectionCard title="Portal do cliente">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>Código de acesso (compartilhe com o cliente)</div>
              <div style={{ fontFamily: "monospace", fontSize: 15, color: NAVY, letterSpacing: 1 }}>{client.accessCode || "—"}</div>
            </div>
            {client.accessCode && (
              <button onClick={() => navigator.clipboard?.writeText(client.accessCode)} style={{ background: "#fff", border: "1px solid #E3E0D6", borderRadius: 6, padding: "6px 12px", fontSize: 12, color: NAVY, cursor: "pointer" }}>
                Copiar
              </button>
            )}
          </div>
        </SectionCard>
      )}
      {client.contactType === "Cliente" && (
        <SectionCard title="Newsletter mensal">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13.5, color: INK }}>
              {optedIn ? "Recebe a newsletter mensal" : "Não recebe a newsletter mensal"}
            </div>
            <button onClick={onToggleOptIn} style={{
              background: optedIn ? NAVY : "#EAE7DC", color: optedIn ? "#EDE6D8" : MUTED,
              border: "none", borderRadius: 20, padding: "6px 14px", fontSize: 12.5, cursor: "pointer",
            }}>
              {optedIn ? "Desativar" : "Ativar"}
            </button>
          </div>
        </SectionCard>
      )}
      {isJudge ? (
        <>
          <SectionCard title={`Casos como juiz (${judgeCases.length})`}>
            {judgeCases.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhum caso vinculado a este juiz.</p>}
            {judgeCases.map((c) => (
              <RowCard key={c.id} onClick={() => onOpenCase(c)} title={c.title} subtitle={`${c.number || "sem número"}${c.vara ? " · " + c.vara : ""}`} right={<Badge text={c.status} />} />
            ))}
          </SectionCard>
          <SectionCard title="Sentenças e jurisprudências aplicáveis">
            {myPrecedents.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhuma sentença/jurisprudência registrada ainda.</p>}
            {myPrecedents.map((p) => (
              <RowCard key={p.id} title={p.description}
                subtitle={p.driveLink ? "" : "sem link do Drive"}
                onDelete={() => onDeletePrecedent(p.id)}
                right={p.driveLink && <a href={p.driveLink} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: NAVY }}>Abrir no Drive ↗</a>} />
            ))}
            <button onClick={onAddPrecedent} style={{ background: "none", border: "none", color: NAVY, fontSize: 12.5, cursor: "pointer", padding: 0, marginTop: 6 }}>+ Adicionar sentença/jurisprudência</button>
          </SectionCard>
        </>
      ) : (
        <>
          <SectionCard title={`Casos vinculados (${linkedCases.length})`}>
            {linkedCases.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhum caso vinculado a este cliente.</p>}
            {linkedCases.map((c) => (
              <RowCard key={c.id} onClick={() => onOpenCase(c)} title={c.title} subtitle={`${c.number || "sem número"}${c.area ? " · " + c.area : ""}`} right={<Badge text={c.status} />} />
            ))}
          </SectionCard>
          <SectionCard title={`Financeiro (${linkedFinance.length})`}>
            {linkedFinance.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhum lançamento vinculado a este cliente.</p>}
            {linkedFinance.map((f) => (
              <RowCard key={f.id} title={f.description} subtitle={fmtDate(f.date)}
                right={<span style={{ color: f.type === "Receita" ? "#27500A" : "#993D1D", fontSize: 13.5, fontWeight: 500 }}>{f.type === "Receita" ? "+" : "-"}{fmtBRL(f.amount)}</span>} />
            ))}
          </SectionCard>
        </>
      )}
      {showProcuracao && (
        <Modal title={`Criar procuração — ${client.name}`} onClose={() => setShowProcuracao(false)}>
          <Field label="Cidade"><input style={inputStyle} value={procCidade} onChange={(e) => setProcCidade(e.target.value)} placeholder="São Paulo" /></Field>
          <Field label="Data"><input type="date" style={inputStyle} value={procData} onChange={(e) => setProcData(e.target.value)} /></Field>
          {procError && <div style={{ color: "#993D1D", fontSize: 12.5, marginBottom: 10 }}>{procError}</div>}
          <SubmitRow onClose={() => setShowProcuracao(false)} onSubmit={gerarProcuracao} submitLabel={procBusy ? "Gerando…" : "Gerar Word"} />
        </Modal>
      )}
    </>
  );
}

function sortByName(arr) {
  return [...arr].sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(todayISO() + "T00:00:00");
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function taskStatus(t) {
  if (!t.done || !t.dueDate || !t.completedAt) return null;
  return t.completedAt <= t.dueDate ? "No prazo" : "Atrasada";
}

function Timeline({ events, onDelete }) {
  const sorted = [...events].sort((a, b) => b.date.localeCompare(a.date));
  if (sorted.length === 0) return <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhum evento registrado ainda.</p>;
  return (
    <div style={{ position: "relative", paddingLeft: 22 }}>
      <div style={{ position: "absolute", left: 5, top: 4, bottom: 4, width: 2, background: "#EAE7DC" }} />
      {sorted.map((e, i) => {
        const isLatest = i === 0;
        const dotColor = isLatest ? GOLD : "#9FB0BE";
        return (
          <div key={e.id} style={{ position: "relative", marginBottom: i === sorted.length - 1 ? 0 : 16 }}>
            <div style={{
              position: "absolute", left: -22, top: 2, width: 12, height: 12, borderRadius: "50%",
              background: dotColor, border: "2px solid #fff", boxShadow: `0 0 0 1px ${dotColor}`,
            }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 10.5, color: isLatest ? GOLD : "#9A917E", fontWeight: isLatest ? 600 : 400, letterSpacing: 0.5 }}>
                  {fmtDate(e.date).toUpperCase()}{isLatest ? " · MAIS RECENTE" : ""}
                </div>
                <div style={{ fontSize: 13, color: isLatest ? NAVY : INK, fontWeight: isLatest ? 600 : 400, margin: "2px 0 4px" }}>{e.description}</div>
              </div>
              <button onClick={() => onDelete(e.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C0997B", flexShrink: 0 }}><Trash2 size={14} /></button>
            </div>
            {e.notes && (
              <div style={{ background: "#fff", border: "1px dashed #DDD8C9", borderRadius: 6, padding: "8px 10px", fontSize: 11.5, color: MUTED }}>
                {e.notes}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TaskRow({ t, onToggle, onDelete, onEdit, showDueInfo, variant, checkboxSize }) {
  const d = daysUntil(t.dueDate);
  const overdue = d !== null && d < 0 && !t.done;
  const dueToday = d === 0 && !t.done;
  const status = taskStatus(t);
  const isCard = variant === "card";

  const metaColor = t.done ? TEXT_META : (overdue || dueToday) ? ALERT_ON_LIGHT : TEXT_META;
  const metaWeight = !t.done && (overdue || dueToday) ? 600 : 400;
  const metaText = t.done
    ? `concluída · ${fmtDate(t.dueDate)}`
    : overdue ? `vencido há ${Math.abs(d)} dia(s)`
    : d === 0 ? "vence hoje"
    : `vence em ${d} dia(s)`;

  return (
    <div style={isCard ? { display: "flex", alignItems: "center", gap: 14 } : { padding: "8px 0", borderBottom: "1px solid #F1EFE8" }}>
      <div style={{ display: "flex", alignItems: "center", gap: isCard ? 14 : 10, width: "100%" }}>
        <div onClick={() => onToggle(t.id)} style={{
          width: checkboxSize || (isCard ? 17 : 15), height: checkboxSize || (isCard ? 17 : 15), borderRadius: isCard ? (checkboxSize >= 20 ? 4 : 3) : "50%", flexShrink: 0, cursor: "pointer",
          border: t.done ? "none" : `1.5px solid ${isCard ? ICON_INACTIVE : "#B8B0A0"}`,
          background: t.done ? SIDEBAR_NAVY : "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {t.done && <Check size={checkboxSize ? checkboxSize - 6 : isCard ? 12 : 10} color="#f5efe4" strokeWidth={3} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: isCard ? 16 : 13, textDecoration: t.done ? "line-through" : "none", color: t.done ? TEXT_META : TEXT_PRIMARY }}>
            {t.title}
            {t.isStallAlert && <span style={{ fontSize: 9.5, background: "#FBE3DC", color: "#993D1D", padding: "1px 7px", borderRadius: 10, marginLeft: 8 }}>Automático</span>}
            {t.recurrenceGroup && <span style={{ fontSize: 9.5, background: CHIP_BG, color: TEXT_SECONDARY, padding: "1px 7px", borderRadius: 10, marginLeft: 8 }}>↻ recorrente</span>}
          </div>
          {showDueInfo && t.dueDate && (
            <div style={{ fontSize: isCard ? 13 : 11, marginTop: isCard ? 2 : 0, color: metaColor, fontWeight: metaWeight }}>{metaText}</div>
          )}
        </div>
        {status && (
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 12, flexShrink: 0,
            background: status === "No prazo" ? "#EAF3DE" : "#FBE3DC",
            color: status === "No prazo" ? "#27500A" : "#993D1D",
          }}>{status}</span>
        )}
        {onEdit && <button onClick={() => onEdit(t)} style={{ background: "none", border: "none", cursor: "pointer", color: ICON_INACTIVE, padding: isCard ? 10 : 4 }}><Pencil size={isCard ? 15 : 13} /></button>}
        <button onClick={() => onDelete(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: ICON_INACTIVE, padding: isCard ? 10 : 4 }}><Trash2 size={isCard ? 15 : 14} /></button>
      </div>
      {t.notes && (
        <div style={{
          background: CHIP_BG, borderRadius: 6, padding: isCard ? "10px 14px" : "7px 9px",
          fontSize: isCard ? 13 : 11, color: isCard ? "#4a4438" : MUTED,
          marginTop: isCard ? 8 : 6, marginLeft: isCard ? 31 : 25,
        }}>
          Solução: {t.notes}
        </div>
      )}
    </div>
  );
}
const SIDEBAR_NAVY = "#12283f";
const SIDEBAR_NAVY_HOVER = "#1a3a5c";
const GOLD_ACCENT = "#c9a227";
const GOLD_DARK = "#8a6d3b";
const ALERT_ON_NAVY = "#d9584f";
const ALERT_ON_LIGHT = "#c04a40";
const CARD_BORDER = "#e6e0d2";
const DIVIDER = "#ddd6c8";
const CHIP_BG = "#f1ede2";
const CONTENT_BG = "#fbf9f4";
const TEXT_PRIMARY = "#23201a";
const TEXT_SECONDARY = "#6b6455";
const TEXT_META = "#857d6c";
const ICON_INACTIVE = "#b8b0a0";
const NAV_TEXT_SECONDARY = "rgba(240,234,221,0.82)";
const NAV_TEXT_TERTIARY = "rgba(240,234,221,0.45)";
const NAV_HOVER_BG = "rgba(240,234,221,0.06)";
const NAV_ACTIVE_BG = "rgba(240,234,221,0.10)";
const NAV_DIVIDER = "rgba(232,226,213,0.16)";

function caseDeadlineInfo(caseItem, tasks) {
  const openTasks = tasks.filter((t) => t.caseId === caseItem.id && !t.done);
  if (openTasks.length === 0) return { openTaskCount: 0, status: "none", label: "sem pendências", nextDueDate: null };
  const withDue = openTasks.filter((t) => t.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (withDue.length === 0) return { openTaskCount: openTasks.length, status: "upcoming", label: `${openTasks.length} tarefa(s)`, nextDueDate: null };
  const next = withDue[0];
  const d = daysUntil(next.dueDate);
  let status = "upcoming";
  if (d < 0) status = "overdue";
  else if (d === 0) status = "today";
  const label = status === "overdue" ? `prazo vencido há ${Math.abs(d)}d`
    : status === "today" ? "1 prazo hoje"
    : `${openTasks.length} tarefa(s) · prazo em ${d}d`;
  return { openTaskCount: openTasks.length, status, label, nextDueDate: next.dueDate };
}

function MobileBottomNav({ active, onNavigate, onAdd, hasTodayAlertByTab }) {
  const ITEMS = [
    { id: "cases", label: "Casos", icon: Briefcase },
    { id: "tasks", label: "Tarefas", icon: CheckSquare },
    { id: "calendar", label: "Agenda", icon: CalendarIcon },
    { id: "more", label: "Mais", icon: Users },
  ];
  return (
    <>
      <button onClick={onAdd} style={{
        position: "fixed", right: 20, bottom: 74 + 22, width: 56, height: 56, borderRadius: 28,
        background: GOLD_ACCENT, color: SIDEBAR_NAVY, border: "none", fontSize: 28, lineHeight: 1,
        boxShadow: "0 8px 20px rgba(18,40,63,0.28)", zIndex: 40, cursor: "pointer",
      }}>+</button>
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, background: SIDEBAR_NAVY,
        padding: "10px 8px 22px", display: "flex", justifyContent: "space-around", alignItems: "flex-end", zIndex: 30,
      }}>
        {ITEMS.map((it) => {
          const isActive = active === it.id;
          const Icon = it.icon;
          return (
            <button key={it.id} onClick={() => onNavigate(it.id)} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
              padding: "6px 14px", minWidth: 64, background: "none", border: "none", cursor: "pointer",
            }}>
              <div style={{ position: "relative" }}>
                <Icon size={20} color={isActive ? GOLD_ACCENT : "rgba(240,234,221,0.7)"} />
                {hasTodayAlertByTab?.[it.id] && (
                  <div style={{ position: "absolute", top: -3, right: -5, width: 8, height: 8, borderRadius: 4, background: ALERT_ON_NAVY }} />
                )}
              </div>
              <div style={{ fontSize: 11, color: isActive ? GOLD_ACCENT : "rgba(240,234,221,0.7)", fontWeight: isActive ? 700 : 400 }}>{it.label}</div>
            </button>
          );
        })}
      </div>
    </>
  );
}

function MobileMoreSheet({ role, onNavigate, onClose, userEmail, onSignOut }) {
  const items = [
    { id: "finance", label: "Financeiro", icon: Wallet },
    { id: "clients", label: "Contatos", icon: Users },
    { id: "intake", label: "Cadastros pendentes", icon: CheckSquare },
    ...(role === "admin" ? [{ id: "newsletter", label: "Newsletter", icon: Mail }] : []),
  ];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(18,40,63,0.4)", zIndex: 50, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: "100%", borderRadius: "16px 16px 0 0", padding: "20px 8px 28px" }}>
        <div style={{ width: 36, height: 4, background: "#e6e0d2", borderRadius: 2, margin: "0 auto 18px" }} />
        {items.map((it) => (
          <button key={it.id} onClick={() => onNavigate(it.id)} style={{
            display: "flex", alignItems: "center", gap: 14, width: "100%", background: "none", border: "none",
            padding: "14px 16px", fontSize: 16, color: TEXT_PRIMARY, cursor: "pointer", textAlign: "left", fontFamily: "inherit",
          }}>
            <it.icon size={19} color={TEXT_SECONDARY} /> {it.label}
          </button>
        ))}
        <div style={{ height: 1, background: "#f1ede2", margin: "6px 16px" }} />
        <div style={{ padding: "10px 16px", fontSize: 12.5, color: TEXT_META }}>{userEmail}</div>
        <button onClick={onSignOut} style={{
          display: "flex", alignItems: "center", gap: 14, width: "100%", background: "none", border: "none",
          padding: "14px 16px", fontSize: 16, color: ALERT_ON_LIGHT, cursor: "pointer", textAlign: "left", fontFamily: "inherit",
        }}>
          <LogOut size={19} /> Sair
        </button>
      </div>
    </div>
  );
}

function MobileCasosScreen({ cases, tasks, search, onSearchChange, onOpenCase }) {
  const activeCasesList = cases
    .filter((c) => c.status === "Ativo")
    .map((c) => ({ ...c, deadline: caseDeadlineInfo(c, tasks) }))
    .filter((c) => !search.trim() || c.title.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      const order = { overdue: 0, today: 1, upcoming: 2, none: 3 };
      const byStatus = order[a.deadline.status] - order[b.deadline.status];
      if (byStatus !== 0) return byStatus;
      if (a.deadline.nextDueDate && b.deadline.nextDueDate) return a.deadline.nextDueDate.localeCompare(b.deadline.nextDueDate);
      if (a.deadline.nextDueDate) return -1;
      if (b.deadline.nextDueDate) return 1;
      return (a.title || "").localeCompare(b.title || "", "pt-BR");
    });

  const todayItem = activeCasesList.find((c) => c.deadline.status === "today");

  return (
    <div style={{ paddingBottom: 110 }}>
      <div style={{ background: SIDEBAR_NAVY, padding: "18px 18px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 20, letterSpacing: "0.3em", color: "#f0eadd" }}>RSAC</div>
          <div style={{ width: 34, height: 34, borderRadius: 17, background: "rgba(240,234,221,0.15)" }} />
        </div>
        <input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Buscar caso…" style={{
          width: "100%", boxSizing: "border-box", background: "rgba(240,234,221,0.12)", border: "1px solid rgba(240,234,221,0.2)",
          borderRadius: 8, padding: "11px 14px", fontSize: 15, color: "#f5efe4", outline: "none",
        }} />
      </div>

      <div style={{ padding: "16px 18px" }}>
        {todayItem && (
          <div onClick={() => onOpenCase(todayItem.id)} style={{ background: "#fdf3f0", border: "1px solid #eccfc8", borderRadius: 10, padding: "14px 16px", marginBottom: 16, cursor: "pointer" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.12em", fontWeight: 700, color: ALERT_ON_LIGHT, marginBottom: 4 }}>HOJE</div>
            <div style={{ fontSize: 16, color: TEXT_PRIMARY }}>{todayItem.title} — {todayItem.deadline.label}</div>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 30, color: SIDEBAR_NAVY }}>Casos</div>
          <div style={{ fontSize: 14, color: GOLD_DARK }}>Ativos ⌄</div>
        </div>
        {activeCasesList.length === 0 && <p style={{ fontSize: 14, color: TEXT_META, textAlign: "center", padding: "20px 0" }}>Nenhum caso encontrado.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {activeCasesList.map((c) => {
            const borderColor = c.deadline.status === "overdue" || c.deadline.status === "today" ? ALERT_ON_LIGHT
              : c.deadline.status === "upcoming" ? GOLD_ACCENT : "transparent";
            const statusColor = c.deadline.status === "overdue" || c.deadline.status === "today" ? ALERT_ON_LIGHT
              : c.deadline.status === "upcoming" ? GOLD_DARK : TEXT_META;
            return (
              <div key={c.id} onClick={() => onOpenCase(c.id)} style={{
                background: "#fff", border: `1px solid ${CARD_BORDER}`, borderLeft: `3px solid ${borderColor}`,
                borderRadius: 8, padding: 16, display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, lineHeight: 1.3, color: TEXT_PRIMARY }}>{c.title}</div>
                  <div style={{ fontSize: 13, fontWeight: c.deadline.status === "none" ? 400 : 600, color: statusColor, marginTop: 3 }}>{c.deadline.label}</div>
                </div>
                <span style={{ color: ICON_INACTIVE, fontSize: 20 }}>›</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MobileCaseScreen({
  item, client, clients, events, tasks, notes, documents, finance,
  onBack, onEdit, onOpenClient, onOpenJudge,
  onAddEvent, onDeleteEvent, onToggleTask, onDeleteTask, onAddTask, onEditTask,
  onAddNote, onDeleteNote, onAddDoc, onDeleteDoc, onAddExpense, onAddPayment, onDeleteFinance,
  caseTypes, caseTypesCatalog, onAddCaseType, onRemoveCaseType,
  onEditNoteContent, onTogglePinNote, onCreateTaskFromNote, onAddNoteRich,
}) {
  const isConsultoria = item.caseType === "Consultoria";
  const [wsTab, setWsTab] = useState(isConsultoria ? "visao-geral" : "tarefas");
  const judge = clients.find((c) => c.id === item.judgeId);
  const caseEvents = events.filter((e) => e.caseId === item.id).sort((a, b) => a.date.localeCompare(b.date));
  const caseTasks = tasks.filter((t) => t.caseId === item.id);
  const openTaskCount = caseTasks.filter((t) => !t.done).length;
  const caseNotes = notes.filter((n) => n.caseId === item.id);
  const caseDocs = documents.filter((d) => d.caseId === item.id);
  const caseFinance = (finance || []).filter((f) => f.caseId === item.id);
  const caseExpenses = caseFinance.filter((f) => f.type === "Despesa");
  const casePayments = caseFinance.filter((f) => f.type === "Receita");

  const TABS = isConsultoria ? [
    { id: "visao-geral", label: "Visão geral", count: 0 },
    { id: "contrato", label: "Contrato", count: 0 },
    { id: "tarefas", label: "Tarefas", count: openTaskCount },
    { id: "anotacoes", label: "Anotações", count: caseNotes.length },
    { id: "documentos", label: "Documentos", count: caseDocs.length },
    { id: "financeiro", label: "Financeiro", count: caseFinance.length },
    { id: "contatos", label: "Contatos", count: 0 },
  ] : [
    { id: "tarefas", label: "Tarefas", count: openTaskCount },
    { id: "prazos", label: "Prazos", count: caseEvents.length },
    { id: "documentos", label: "Documentos", count: caseDocs.length },
    { id: "financeiro", label: "Financeiro", count: caseFinance.length },
    { id: "contatos", label: "Contatos", count: 0 },
  ];
  const footerLabel = {
    "visao-geral": null, contrato: null,
    tarefas: "+ Nova tarefa neste caso", prazos: "+ Adicionar evento", anotacoes: "+ Adicionar anotação", documentos: "+ Adicionar documento",
    financeiro: "+ Adicionar lançamento", contatos: null,
  }[wsTab];
  const footerAction = {
    "visao-geral": null, contrato: null,
    tarefas: onAddTask, prazos: onAddEvent, anotacoes: onAddNote, documentos: onAddDoc, financeiro: onAddExpense, contatos: null,
  }[wsTab];

  const openTasks = caseTasks.filter((t) => !t.done).sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const doneTasks = caseTasks.filter((t) => t.done);

  return (
    <div style={{ paddingBottom: footerAction ? 90 : 20 }}>
      <div style={{ background: SIDEBAR_NAVY, padding: "16px 18px 0", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(240,234,221,0.8)", fontSize: 15, cursor: "pointer", padding: 0 }}>‹ Casos</button>
          <button onClick={onEdit} style={{ background: "none", border: "none", color: "rgba(240,234,221,0.8)", fontSize: 15, cursor: "pointer", padding: 0 }}>⋯</button>
        </div>
        <div style={{ fontSize: 10, letterSpacing: "0.14em", fontWeight: 700, color: GOLD_ACCENT, marginBottom: 4 }}>
          CASO · {item.caseType === "Judicial" ? "PROCESSO JUDICIAL" : "CONSULTORIA"}
        </div>
        <div style={{ fontFamily: "Georgia, serif", fontSize: 26, lineHeight: 1.2, color: "#f5efe4", marginBottom: 12, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.title}</div>
        {item.caseType === "Consultoria" && (
          <div style={{ marginBottom: 12 }}>
            <CaseTypeTags types={caseTypes} catalog={caseTypesCatalog} onAdd={onAddCaseType} onRemove={onRemoveCaseType} />
          </div>
        )}
        <div style={{ display: "flex", gap: 22, overflowX: "auto", paddingTop: 13, paddingBottom: 13, borderTop: "1px solid rgba(232,226,213,0.12)", whiteSpace: "nowrap" }}>
          {TABS.map((t) => {
            const active = wsTab === t.id;
            return (
              <div key={t.id} onClick={() => setWsTab(t.id)} style={{
                fontSize: 15, cursor: "pointer", flexShrink: 0,
                color: active ? "#f5efe4" : "rgba(240,234,221,0.65)", fontWeight: active ? 700 : 400,
                borderBottom: active ? `2px solid ${GOLD_ACCENT}` : "2px solid transparent", paddingBottom: 4,
              }}>
                {t.label}{t.count > 0 ? ` ${t.count}` : ""}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "18px 18px 0" }}>
        {wsTab === "visao-geral" && (
          <SectionCard title="Visão geral">
            <p style={{ fontSize: 13.5, color: MUTED, margin: 0 }}>Em construção — a faixa de contrato ativo, tarefas recentes e última anotação chegam junto com os itens 3 (Anotações) e 5 (Contratos) do pacote.</p>
          </SectionCard>
        )}

        {wsTab === "contrato" && (
          <SectionCard title="Contrato">
            <p style={{ fontSize: 13.5, color: MUTED, margin: 0 }}>Em construção — a gestão de contratos (vigência, honorários, renovação) chega no item 5 do pacote.</p>
          </SectionCard>
        )}

        {wsTab === "tarefas" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {caseTasks.length === 0 && <p style={{ fontSize: 15, color: TEXT_META, textAlign: "center", padding: "30px 0" }}>Nenhuma tarefa neste caso.</p>}
            {openTasks.map((t) => (
              <div key={t.id} style={{ background: "#fff", border: `1px solid ${CARD_BORDER}`, borderRadius: 8, padding: "16px 18px" }}>
                <TaskRow t={t} onToggle={onToggleTask} onDelete={onDeleteTask} onEdit={onEditTask} showDueInfo variant="card" checkboxSize={22} />
              </div>
            ))}
            {doneTasks.length > 0 && (
              <>
                <div style={{ fontSize: 11, letterSpacing: 1, color: TEXT_META, textTransform: "uppercase", margin: "10px 0 0" }}>Concluídas</div>
                {doneTasks.map((t) => (
                  <div key={t.id} style={{ background: "#fff", border: `1px solid ${CARD_BORDER}`, borderRadius: 8, padding: "16px 18px", opacity: 0.72 }}>
                    <TaskRow t={t} onToggle={onToggleTask} onDelete={onDeleteTask} onEdit={onEditTask} showDueInfo variant="card" checkboxSize={22} />
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {wsTab === "prazos" && (
          <>
            <SectionCard title="Dados processuais">
              <InfoRow label="Número" value={item.number} />
              <InfoRow label="Área" value={item.area} />
              {item.caseType === "Judicial" && <>
                <InfoRow label="Tribunal" value={item.tribunal} />
                <InfoRow label="Comarca" value={item.comarca} />
                <InfoRow label="Vara" value={item.vara} />
                <InfoRow label="Valor da causa" value={item.valorCausa ? fmtBRL(item.valorCausa) : null} />
              </>}
            </SectionCard>
            <SectionCard title="Andamento processual">
              <Timeline events={caseEvents} onDelete={onDeleteEvent} />
            </SectionCard>
          </>
        )}

        {wsTab === "documentos" && (
          <>
            <SectionCard title="Banco de petições">
              {caseDocs.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhum documento referenciado ainda.</p>}
              {caseDocs.map((d) => (
                <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F1EFE8" }}>
                  <div style={{ fontSize: 13, color: INK }}>{d.name}</div>
                  {d.driveLink && <a href={d.driveLink} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: SIDEBAR_NAVY }}>Abrir ↗</a>}
                </div>
              ))}
            </SectionCard>
            {!isConsultoria && (
              <SectionCard title="Anotações">
                {caseNotes.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhuma anotação registrada.</p>}
                {caseNotes.map((n) => (
                  <div key={n.id} style={{ padding: "8px 0", borderBottom: "1px solid #F1EFE8" }}>
                    <div style={{ fontSize: 11, color: "#9A917E" }}>{fmtDate(n.date)}</div>
                    <div style={{ fontSize: 13, color: INK }}>{n.content}</div>
                  </div>
                ))}
                <button onClick={onAddNote} style={{ background: "none", border: "none", color: NAVY, fontSize: 12.5, cursor: "pointer", padding: 0, marginTop: 10 }}>+ Adicionar anotação</button>
              </SectionCard>
            )}
          </>
        )}
        {wsTab === "anotacoes" && (
          <NotesPanel
            notes={caseNotes}
            participantsPool={clients}
            tasks={tasks}
            onAdd={(values) => onAddNoteRich(values)}
            onEdit={onEditNoteContent}
            onDelete={onDeleteNote}
            onTogglePin={onTogglePinNote}
            onCreateTaskFromNote={onCreateTaskFromNote}
          />
        )}


        {wsTab === "financeiro" && (
          <>
            <SectionCard title="Despesas processuais">
              {caseExpenses.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhuma despesa registrada.</p>}
              {caseExpenses.map((f) => (
                <RowCard key={f.id} title={f.description} subtitle={fmtDate(f.date)} onDelete={() => onDeleteFinance(f.id)}
                  right={<span style={{ color: "#993D1D", fontSize: 13.5, fontWeight: 500 }}>-{fmtBRL(f.amount)}</span>} />
              ))}
            </SectionCard>
            <SectionCard title="Pagamentos do cliente">
              {casePayments.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhum pagamento registrado.</p>}
              {casePayments.map((f) => (
                <RowCard key={f.id} title={f.description} subtitle={fmtDate(f.date)} onDelete={() => onDeleteFinance(f.id)}
                  right={<span style={{ color: "#27500A", fontSize: 13.5, fontWeight: 500 }}>+{fmtBRL(f.amount)}</span>} />
              ))}
            </SectionCard>
          </>
        )}

        {wsTab === "contatos" && (
          <>
            <SectionCard title="Cliente">
              {client ? <RowCard onClick={() => onOpenClient(client)} title={client.name} subtitle={client.email || "sem e-mail"} /> : <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhum cliente vinculado.</p>}
            </SectionCard>
            {item.caseType === "Judicial" && (
              <SectionCard title="Juiz e gabinete">
                {judge ? (
                  <>
                    <RowCard onClick={() => onOpenJudge(judge)} title={judge.name} subtitle={judge.address || "Ver cadastro completo"} />
                    <div style={{ marginTop: 10 }}><InfoRowEmail label="E-mail" value={judge.email} /><InfoRow label="Telefone" value={judge.phone} /></div>
                  </>
                ) : <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhum juiz vinculado.</p>}
              </SectionCard>
            )}
          </>
        )}
      </div>

      {footerAction && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: 16, background: "#fff", borderTop: `1px solid ${CARD_BORDER}` }}>
          <button onClick={footerAction} style={{ width: "100%", background: SIDEBAR_NAVY, color: "#f5efe4", fontSize: 16, fontWeight: 600, padding: 15, borderRadius: 8, border: "none", cursor: "pointer" }}>{footerLabel}</button>
        </div>
      )}
    </div>
  );
}

function MobileTasksScreen({ tasks, cases, onToggle, onDelete, onEdit, onOpenCase }) {
  const [filter, setFilter] = useState("abertas");
  const todayStr = todayISO();
  let visible = tasks;
  if (filter === "hoje") visible = tasks.filter((t) => t.dueDate === todayStr && !t.done);
  else if (filter === "abertas") visible = tasks.filter((t) => !t.done);
  else if (filter === "semcaso") visible = tasks.filter((t) => !t.caseId);

  const CHIPS = [{ id: "hoje", label: "Hoje" }, { id: "abertas", label: "Abertas" }, { id: "semcaso", label: "Sem caso" }];

  return (
    <div style={{ paddingBottom: 100 }}>
      <div style={{ background: SIDEBAR_NAVY, padding: "18px 18px 16px" }}>
        <div style={{ fontFamily: "Georgia, serif", fontSize: 28, color: "#f5efe4", marginBottom: 14 }}>Tarefas</div>
        <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
          {CHIPS.map((c) => {
            const active = filter === c.id;
            return (
              <div key={c.id} onClick={() => setFilter(c.id)} style={{
                flexShrink: 0, padding: "8px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                background: active ? GOLD_ACCENT : "transparent", color: active ? SIDEBAR_NAVY : "rgba(240,234,221,0.8)",
                fontWeight: active ? 700 : 400, border: active ? "none" : "1px solid rgba(240,234,221,0.28)",
              }}>{c.label}</div>
            );
          })}
        </div>
      </div>
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        {visible.length === 0 && <p style={{ fontSize: 14, color: TEXT_META, textAlign: "center", padding: "20px 0" }}>Nenhuma tarefa aqui.</p>}
        {visible.map((t) => {
          const c = cases.find((cs) => cs.id === t.caseId);
          return (
            <div key={t.id} style={{ background: "#fff", border: `1px solid ${CARD_BORDER}`, borderRadius: 8, padding: "16px 18px" }}>
              <TaskRow t={t} onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} showDueInfo variant="card" checkboxSize={22} />
              <div style={{ marginLeft: 31, marginTop: 6 }}>
                {c ? (
                  <span onClick={() => onOpenCase(c.id)} style={{ fontSize: 13, color: GOLD_DARK, cursor: "pointer" }}>{c.title} ›</span>
                ) : (
                  <span style={{ fontSize: 13, color: GOLD_DARK, cursor: "pointer" }}>Vincular a um caso ›</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CaseWorkspace({
  item, client, clients, events, tasks, notes, documents, precedents, finance,
  onEdit, onDelete, onOpenClient, onOpenJudge,
  onAddEvent, onDeleteEvent, onToggleTask, onDeleteTask, onAddTask, onEditTask,
  onAddNote, onDeleteNote, onAddDoc, onDeleteDoc, onAddExpense, onAddPayment, onDeleteFinance,
  caseTypes, caseTypesCatalog, onAddCaseType, onRemoveCaseType,
  onEditNoteContent, onTogglePinNote, onCreateTaskFromNote, onAddNoteRich,
}) {
  const isConsultoria = item.caseType === "Consultoria";
  const [wsTab, setWsTab] = useState(isConsultoria ? "visao-geral" : "tarefas");
  const judge = clients.find((c) => c.id === item.judgeId);
  const caseEvents = events.filter((e) => e.caseId === item.id).sort((a, b) => a.date.localeCompare(b.date));
  const caseTasks = tasks.filter((t) => t.caseId === item.id);
  const openTaskCount = caseTasks.filter((t) => !t.done).length;
  const caseNotes = notes.filter((n) => n.caseId === item.id);
  const caseDocs = documents.filter((d) => d.caseId === item.id);
  const caseFinance = (finance || []).filter((f) => f.caseId === item.id);
  const caseExpenses = caseFinance.filter((f) => f.type === "Despesa");
  const casePayments = caseFinance.filter((f) => f.type === "Receita");

  const TABS = isConsultoria ? [
    { id: "visao-geral", label: "Visão geral", count: 0 },
    { id: "contrato", label: "Contrato", count: 0 },
    { id: "tarefas", label: "Tarefas", count: openTaskCount },
    { id: "anotacoes", label: "Anotações", count: caseNotes.length },
    { id: "documentos", label: "Documentos", count: caseDocs.length },
    { id: "financeiro", label: "Financeiro", count: caseFinance.length },
    { id: "contatos", label: "Contatos", count: 0 },
  ] : [
    { id: "tarefas", label: "Tarefas", count: openTaskCount },
    { id: "prazos", label: "Prazos", count: caseEvents.length },
    { id: "documentos", label: "Documentos", count: caseDocs.length },
    { id: "financeiro", label: "Financeiro", count: caseFinance.length },
    { id: "contatos", label: "Contatos", count: 0 },
  ];

  const addLabel = {
    "visao-geral": null, contrato: null,
    tarefas: "+ Nova tarefa", prazos: "+ Adicionar evento", anotacoes: "+ Adicionar anotação", documentos: "+ Adicionar documento",
    financeiro: "+ Adicionar lançamento", contatos: null,
  }[wsTab];
  const addAction = {
    "visao-geral": null, contrato: null,
    tarefas: onAddTask, prazos: onAddEvent, anotacoes: onAddNote, documentos: onAddDoc, financeiro: onAddExpense, contatos: null,
  }[wsTab];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.5, fontWeight: 600, color: GOLD_DARK, marginBottom: 6, textTransform: "uppercase" }}>
            CASO · {item.caseType === "Judicial" ? "PROCESSO JUDICIAL" : "CONSULTORIA"}
          </div>
          <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 600, fontSize: 32, lineHeight: 1.15, color: SIDEBAR_NAVY, margin: 0 }}>{item.title}</h1>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 8 }}>
            {[item.number, item.vara].filter(Boolean).join(" · ") || "sem dados processuais"}
          </div>
          {item.caseType === "Consultoria" && (
            <div style={{ marginTop: 12 }}>
              <CaseTypeTags types={caseTypes} catalog={caseTypesCatalog} onAdd={onAddCaseType} onRemove={onRemoveCaseType} />
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={onEdit} style={{ background: "#fff", border: "1px solid #E3E0D6", color: SIDEBAR_NAVY, fontSize: 13, fontWeight: 600, padding: "10px 14px", borderRadius: 6, cursor: "pointer" }}>Editar</button>
          {addAction && (
            <button onClick={addAction} style={{ background: SIDEBAR_NAVY, color: "#f5efe4", border: "none", fontSize: 14, fontWeight: 600, padding: "11px 18px", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap" }}>{addLabel}</button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 26, borderBottom: `1px solid ${DIVIDER}`, marginBottom: 20 }}>
        {TABS.map((t) => {
          const active = wsTab === t.id;
          return (
            <button key={t.id} onClick={() => setWsTab(t.id)} style={{
              background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
              fontSize: 14, fontWeight: active ? 600 : 400, color: active ? SIDEBAR_NAVY : TEXT_SECONDARY,
              padding: "0 0 11px", borderBottom: active ? `2px solid ${GOLD_ACCENT}` : "2px solid transparent",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              {t.label}
              {t.count > 0 && <span style={{ fontSize: 12, color: TEXT_META }}>{t.count}</span>}
            </button>
          );
        })}
      </div>

      {wsTab === "visao-geral" && (
        <SectionCard title="Visão geral">
          <p style={{ fontSize: 13.5, color: MUTED, margin: 0 }}>Em construção — a faixa de contrato ativo, tarefas recentes e última anotação chegam junto com os itens 3 (Anotações) e 5 (Contratos) do pacote.</p>
        </SectionCard>
      )}

      {wsTab === "contrato" && (
        <SectionCard title="Contrato">
          <p style={{ fontSize: 13.5, color: MUTED, margin: 0 }}>Em construção — a gestão de contratos (vigência, honorários, renovação) chega no item 5 do pacote.</p>
        </SectionCard>
      )}

      {wsTab === "tarefas" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {caseTasks.length === 0 && (
            <div style={{ textAlign: "center", padding: "30px 0" }}>
              <p style={{ fontSize: 15, color: TEXT_META, margin: "0 0 12px" }}>Nenhuma tarefa neste caso.</p>
              <button onClick={onAddTask} style={{ background: "#fff", border: `1px solid ${CARD_BORDER}`, color: SIDEBAR_NAVY, fontSize: 13, fontWeight: 600, padding: "9px 16px", borderRadius: 6, cursor: "pointer" }}>Adicionar tarefa</button>
            </div>
          )}
          {caseTasks.slice().sort((a, b) => {
            if (a.done !== b.done) return a.done ? 1 : -1;
            if (!a.dueDate && !b.dueDate) return 0;
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return a.dueDate.localeCompare(b.dueDate);
          }).map((t) => (
            <div key={t.id} style={{ background: "#fff", border: `1px solid ${CARD_BORDER}`, borderRadius: 8, padding: "16px 18px", opacity: t.done ? 0.72 : 1 }}>
              <TaskRow t={t} onToggle={onToggleTask} onDelete={onDeleteTask} onEdit={onEditTask} showDueInfo variant="card" />
            </div>
          ))}
        </div>
      )}

      {wsTab === "prazos" && (
        <>
          <SectionCard title="Dados processuais">
            <InfoRow label="Número" value={item.number} />
            <InfoRow label="Área" value={item.area} />
            {item.caseType === "Judicial" && <>
              <InfoRow label="Tribunal" value={item.tribunal} />
              <InfoRow label="Comarca" value={item.comarca} />
              <InfoRow label="Instância" value={item.instancia} />
              <InfoRow label="Vara" value={item.vara} />
            </>}
            <InfoRow label="Valor da causa" value={item.valorCausa ? fmtBRL(item.valorCausa) : null} />
            <InfoRow label="Condenação / Resultado" value={item.condenacaoResultado ? fmtBRL(item.condenacaoResultado) : null} />
            <InfoRow label="Honorários contratuais" value={
              !item.honorariosContratuais ? null
              : item.honorariosTipo === "percentual"
                ? `${item.honorariosContratuais}%${item.condenacaoResultado ? ` (${fmtBRL(item.condenacaoResultado * item.honorariosContratuais / 100)} sobre a condenação)` : ""}`
                : fmtBRL(item.honorariosContratuais)
            } />
            {item.tribunalLink && (
              <div style={{ marginTop: 10 }}>
                <a href={item.tribunalLink} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: NAVY, border: "1px solid #E3E0D6", borderRadius: 6, padding: "6px 12px", textDecoration: "none" }}>Consultar no tribunal ↗</a>
              </div>
            )}
          </SectionCard>
          <SectionCard title="Andamento processual">
            <Timeline events={caseEvents} onDelete={onDeleteEvent} />
          </SectionCard>
        </>
      )}

      {wsTab === "documentos" && (
        <>
          <SectionCard title="Banco de petições">
            {caseDocs.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhum documento referenciado ainda.</p>}
            {caseDocs.map((d) => (
              <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F1EFE8" }}>
                <div style={{ fontSize: 13, color: INK }}>{d.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {d.driveLink && <a href={d.driveLink} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: NAVY }}>Abrir no Drive ↗</a>}
                  <button onClick={() => onDeleteDoc(d.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C0997B" }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </SectionCard>
        </>
      )}

      {wsTab === "anotacoes" && (
        <NotesPanel
          notes={caseNotes}
          participantsPool={clients}
          tasks={tasks}
          onAdd={(values) => onAddNoteRich(values)}
          onEdit={onEditNoteContent}
          onDelete={onDeleteNote}
          onTogglePin={onTogglePinNote}
          onCreateTaskFromNote={onCreateTaskFromNote}
        />
      )}


      {wsTab === "financeiro" && (
        <>
          <SectionCard title="Despesas processuais">
            {caseExpenses.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhuma despesa registrada ainda.</p>}
            {caseExpenses.map((f) => (
              <RowCard key={f.id} title={f.description} subtitle={fmtDate(f.date)} onDelete={() => onDeleteFinance(f.id)}
                right={<span style={{ color: "#993D1D", fontSize: 13.5, fontWeight: 500 }}>-{fmtBRL(f.amount)}</span>} />
            ))}
            <button onClick={onAddExpense} style={{ background: "none", border: "none", color: NAVY, fontSize: 12.5, cursor: "pointer", padding: 0, marginTop: 10 }}>+ Adicionar despesa processual</button>
          </SectionCard>
          <SectionCard title="Pagamentos do cliente">
            {casePayments.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhum pagamento registrado ainda.</p>}
            {casePayments.map((f) => (
              <RowCard key={f.id} title={f.description} subtitle={fmtDate(f.date)} onDelete={() => onDeleteFinance(f.id)}
                right={<span style={{ color: "#27500A", fontSize: 13.5, fontWeight: 500 }}>+{fmtBRL(f.amount)}</span>} />
            ))}
            <button onClick={onAddPayment} style={{ background: "none", border: "none", color: NAVY, fontSize: 12.5, cursor: "pointer", padding: 0, marginTop: 10 }}>+ Adicionar pagamento do cliente</button>
          </SectionCard>
        </>
      )}

      {wsTab === "contatos" && (
        <>
          <SectionCard title="Cliente">
            {client ? (
              <RowCard onClick={() => onOpenClient(client)} title={client.name} subtitle={`${client.type === "PJ" ? "Pessoa jurídica" : "Pessoa física"} · ${client.email || "sem e-mail"}`} />
            ) : (
              <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhum cliente vinculado.</p>
            )}
          </SectionCard>
          {item.caseType === "Judicial" && (
            <SectionCard title="Juiz e gabinete">
              {judge ? (
                <>
                  <RowCard onClick={() => onOpenJudge(judge)} title={judge.name} subtitle={judge.address || "Ver cadastro completo"} />
                  <div style={{ marginTop: 10 }}><InfoRowEmail label="E-mail" value={judge.email} /><InfoRow label="Telefone" value={judge.phone} /></div>
                </>
              ) : (
                <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhum juiz vinculado. Edite o caso para selecionar um contato do tipo Juiz.</p>
              )}
              {item.balcaoVirtualLink && (
                <div style={{ marginTop: 10 }}>
                  <a href={item.balcaoVirtualLink} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: NAVY, border: "1px solid #E3E0D6", borderRadius: 6, padding: "6px 12px", textDecoration: "none" }}>Balcão virtual ↗</a>
                </div>
              )}
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
function CaseFolder({
  item, client, clients, events, tasks, notes, documents, precedents, finance,
  onBack, onEdit, onDelete, onOpenClient, onOpenJudge,
  onAddEvent, onDeleteEvent, onToggleTask, onDeleteTask, onAddTask, onEditTask,
  onAddNote, onDeleteNote, onAddDoc, onDeleteDoc, onAddExpense, onAddPayment, onDeleteFinance,
}) {
  const judge = clients.find((c) => c.id === item.judgeId);
  const caseEvents = events.filter((e) => e.caseId === item.id).sort((a, b) => a.date.localeCompare(b.date));
  const caseTasks = tasks.filter((t) => t.caseId === item.id);
  const caseNotes = notes.filter((n) => n.caseId === item.id);
  const caseDocs = documents.filter((d) => d.caseId === item.id);
  const caseFinance = (finance || []).filter((f) => f.caseId === item.id);
  const caseExpenses = caseFinance.filter((f) => f.type === "Despesa");
  const casePayments = caseFinance.filter((f) => f.type === "Receita");
  const doneCount = caseTasks.filter((t) => t.done).length;
  const progress = caseTasks.length ? Math.round((doneCount / caseTasks.length) * 100) : 0;

  return (
    <>
      <DetailHeader onBack={onBack} title={item.title}
        badge={<span style={{ display: "flex", gap: 6 }}><Badge text={item.status} /><span style={{ fontSize: 11, background: "#F1EFE8", color: MUTED, padding: "2px 9px", borderRadius: 12 }}>{item.caseType}</span></span>}
        onEdit={onEdit} onDelete={onDelete} />

      {item.caseType === "Judicial" && (
        <SectionCard title="Dados processuais">
          <InfoRow label="Número" value={item.number} />
          <InfoRow label="Área" value={item.area} />
          <InfoRow label="Tribunal" value={item.tribunal} />
          <InfoRow label="Comarca" value={item.comarca} />
          <InfoRow label="Instância" value={item.instancia} />
          <InfoRow label="Vara" value={item.vara} />
          <InfoRow label="Valor da causa" value={item.valorCausa ? fmtBRL(item.valorCausa) : null} />
          <InfoRow label="Honorários contratuais" value={item.honorariosContratuais ? fmtBRL(item.honorariosContratuais) : null} />
          {item.tribunalLink && (
            <div style={{ marginTop: 10 }}>
              <a href={item.tribunalLink} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: NAVY, border: "1px solid #E3E0D6", borderRadius: 6, padding: "6px 12px", textDecoration: "none" }}>
                Consultar no tribunal ↗
              </a>
            </div>
          )}
        </SectionCard>
      )}

      {item.caseType === "Judicial" && (
        <SectionCard title="Juiz e gabinete">
          {judge ? (
            <>
              <RowCard onClick={() => onOpenJudge(judge)} title={judge.name} subtitle={judge.address || "Ver cadastro completo"} />
              <div style={{ marginTop: 10 }}>
                <InfoRowEmail label="E-mail" value={judge.email} />
                <InfoRow label="Telefone" value={judge.phone} />
              </div>
            </>
          ) : (
            <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhum juiz vinculado. Edite o caso para selecionar um contato do tipo Juiz.</p>
          )}
          {item.balcaoVirtualLink ? (
            <div style={{ marginTop: 10 }}>
              <a href={item.balcaoVirtualLink} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: NAVY, border: "1px solid #E3E0D6", borderRadius: 6, padding: "6px 12px", textDecoration: "none" }}>
                Balcão virtual ↗
              </a>
            </div>
          ) : (
            <p style={{ fontSize: 11.5, color: MUTED, margin: "10px 0 0" }}>Nenhum link de balcão virtual cadastrado. Edite o caso para adicionar.</p>
          )}
        </SectionCard>
      )}

      {item.caseType !== "Judicial" && (
        <SectionCard title="Dados do caso">
          <InfoRow label="Número" value={item.number} />
          <InfoRow label="Área" value={item.area} />
          <InfoRow label="Status" value={item.status} />
        </SectionCard>
      )}

      <SectionCard title="Cliente">
        {client ? (
          <RowCard onClick={() => onOpenClient(client)}
            title={client.name} subtitle={`${client.type === "PJ" ? "Pessoa jurídica" : "Pessoa física"} · ${client.email || "sem e-mail"}`} />
        ) : (
          <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhum cliente vinculado.</p>
        )}
      </SectionCard>

      <SectionCard title={item.caseType === "Judicial" ? "Timeline processual" : "Timeline do caso"}>
        <div style={{ marginBottom: 10 }}>
          <Timeline events={caseEvents} onDelete={onDeleteEvent} />
        </div>
        <button onClick={onAddEvent} style={{ background: "none", border: "none", color: NAVY, fontSize: 12.5, cursor: "pointer", padding: 0 }}>+ Adicionar evento</button>
      </SectionCard>

      {item.caseType === "Consultoria" ? (
        <SectionCard title="Tarefas do caso">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: MUTED }}>{doneCount} de {caseTasks.length} concluídas</span>
          </div>
          <div style={{ height: 6, background: "#F1EFE8", borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
            <div style={{ width: `${progress}%`, height: "100%", background: "#B08D57" }} />
          </div>
          {caseTasks.map((t) => (
            <TaskRow key={t.id} t={t} onToggle={onToggleTask} onDelete={onDeleteTask} onEdit={onEditTask} showDueInfo />
          ))}
          <button onClick={onAddTask} style={{ background: "none", border: "none", color: NAVY, fontSize: 12.5, cursor: "pointer", padding: 0, marginTop: 10 }}>+ Adicionar tarefa</button>
        </SectionCard>
      ) : (
        <SectionCard title="Prazos">
          {caseTasks.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhum prazo cadastrado.</p>}
          {caseTasks.map((t) => (
            <TaskRow key={t.id} t={t} onToggle={onToggleTask} onDelete={onDeleteTask} onEdit={onEditTask} showDueInfo />
          ))}
          <button onClick={onAddTask} style={{ background: "none", border: "none", color: NAVY, fontSize: 12.5, cursor: "pointer", padding: 0, marginTop: 10 }}>+ Adicionar prazo</button>
        </SectionCard>
      )}

      {item.caseType === "Judicial" && (
        <>
          <SectionCard title="Anotações">
            {caseNotes.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhuma anotação registrada.</p>}
            {caseNotes.map((n) => (
              <div key={n.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid #F1EFE8" }}>
                <div>
                  <div style={{ fontSize: 11, color: "#9A917E" }}>{fmtDate(n.date)}</div>
                  <div style={{ fontSize: 13, color: INK }}>{n.content}</div>
                </div>
                <button onClick={() => onDeleteNote(n.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C0997B" }}><Trash2 size={14} /></button>
              </div>
            ))}
            <button onClick={onAddNote} style={{ background: "none", border: "none", color: NAVY, fontSize: 12.5, cursor: "pointer", padding: 0, marginTop: 10 }}>+ Adicionar anotação</button>
          </SectionCard>

          <SectionCard title="Banco de petições">
            {caseDocs.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhum documento referenciado ainda.</p>}
            {caseDocs.map((d) => (
              <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F1EFE8" }}>
                <div style={{ fontSize: 13, color: INK }}>{d.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {d.driveLink && <a href={d.driveLink} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: NAVY }}>Abrir no Drive ↗</a>}
                  <button onClick={() => onDeleteDoc(d.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C0997B" }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
            <button onClick={onAddDoc} style={{ background: "none", border: "none", color: NAVY, fontSize: 12.5, cursor: "pointer", padding: 0, marginTop: 10 }}>+ Adicionar documento</button>
          </SectionCard>
        </>
      )}

      <SectionCard title="Despesas processuais">
        {caseExpenses.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhuma despesa registrada ainda.</p>}
        {caseExpenses.map((f) => (
          <RowCard key={f.id} title={f.description} subtitle={fmtDate(f.date)} onDelete={() => onDeleteFinance(f.id)}
            right={<span style={{ color: "#993D1D", fontSize: 13.5, fontWeight: 500 }}>-{fmtBRL(f.amount)}</span>} />
        ))}
        <button onClick={onAddExpense} style={{ background: "none", border: "none", color: NAVY, fontSize: 12.5, cursor: "pointer", padding: 0, marginTop: 10 }}>+ Adicionar despesa processual</button>
      </SectionCard>

      <SectionCard title="Pagamentos do cliente">
        {casePayments.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhum pagamento registrado ainda.</p>}
        {casePayments.map((f) => (
          <RowCard key={f.id} title={f.description} subtitle={fmtDate(f.date)} onDelete={() => onDeleteFinance(f.id)}
            right={<span style={{ color: "#27500A", fontSize: 13.5, fontWeight: 500 }}>+{fmtBRL(f.amount)}</span>} />
        ))}
        <button onClick={onAddPayment} style={{ background: "none", border: "none", color: NAVY, fontSize: 12.5, cursor: "pointer", padding: 0, marginTop: 10 }}>+ Adicionar pagamento do cliente</button>
      </SectionCard>
    </>
  );
}

function AgendaTab({ tasks, onDeleteTask, onAddTask, onTokenAcquired, onSyncAll }) {
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [viewMonth, setViewMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEvents, setGoogleEvents] = useState([]);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const tokenRef = React.useRef(null);
  const tokenClientRef = React.useRef(null);

  const taskItems = tasks.filter((t) => t.dueDate).map((t) => ({
    kind: t.time ? "Compromisso" : "Tarefa", date: t.dueDate, id: t.id, title: t.title,
    extra: t.time || "", location: t.location || "", done: t.done, googleSynced: t.googleSynced,
  }));
  const googleItems = googleEvents.map((g) => ({ kind: "Google", date: g.date, id: g.id, title: g.title, extra: g.time || "", location: "", done: false }));
  const allItems = [...taskItems, ...googleItems];
  const itemsByDate = {};
  allItems.forEach((it) => { (itemsByDate[it.date] = itemsByDate[it.date] || []).push(it); });

  const connectGoogle = async () => {
    setGoogleBusy(true);
    await loadGoogleScript();
    if (!tokenClientRef.current) {
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SCOPE,
        callback: async (resp) => {
          if (resp?.access_token) {
            tokenRef.current = resp.access_token;
            setGoogleConnected(true);
            if (onTokenAcquired) onTokenAcquired(resp.access_token);
            const evs = await fetchGoogleEvents(resp.access_token, viewMonth);
            setGoogleEvents(evs);
          }
          setGoogleBusy(false);
        },
      });
    }
    tokenClientRef.current.requestAccessToken();
  };

  useEffect(() => {
    if (googleConnected && tokenRef.current) {
      fetchGoogleEvents(tokenRef.current, viewMonth).then(setGoogleEvents);
    }
  }, [viewMonth, googleConnected]);

  // Semana contendo selectedDate (segunda a domingo)
  const sel = new Date(selectedDate + "T00:00:00");
  const weekStart = new Date(sel);
  const dow = (sel.getDay() + 6) % 7; // 0 = segunda
  weekStart.setDate(sel.getDate() - dow);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
    return d;
  });
  const dayLabels = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
  const iso = (d) => d.toISOString().slice(0, 10);

  // Grade do mês
  const monthFirst = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const monthLast = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);
  const gridStart = new Date(monthFirst);
  gridStart.setDate(monthFirst.getDate() - ((monthFirst.getDay() + 6) % 7));
  const gridDays = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; });

  const dayItems = itemsByDate[selectedDate] || [];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: "Georgia, serif", color: NAVY, fontSize: 24, margin: "0 0 4px" }}>Agenda</h1>
          <p style={{ color: MUTED, fontSize: 13.5, margin: 0 }}>Compromissos e prazos de tarefas.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={connectGoogle} disabled={googleBusy} style={{
            display: "flex", alignItems: "center", gap: 6, background: googleConnected ? "#EAF3DE" : "#fff",
            color: googleConnected ? "#27500A" : NAVY, border: "1px solid #E3E0D6", borderRadius: 6, padding: "7px 12px", fontSize: 12, cursor: "pointer",
          }}>
            {googleConnected ? "Sincronizado com Google Agenda" : googleBusy ? "Conectando…" : "Conectar Google Agenda"}
          </button>
          {googleConnected && tasks.some((t) => t.time && !t.googleSynced) && (
            <button onClick={async () => { setSyncingAll(true); await onSyncAll(); setSyncingAll(false); }} disabled={syncingAll} style={{
              background: "#fff", border: "1px solid #E3E0D6", borderRadius: 6, padding: "7px 12px", fontSize: 12, color: NAVY, cursor: "pointer",
            }}>
              {syncingAll ? "Sincronizando…" : "Sincronizar todos"}
            </button>
          )}
          <AddButton onClick={onAddTask} />
        </div>
      </div>

      {/* Semana */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5, marginBottom: 18 }}>
        {weekDays.map((d, i) => {
          const dISO = iso(d);
          const active = dISO === selectedDate;
          const hasItems = !!itemsByDate[dISO];
          return (
            <div key={dISO} onClick={() => setSelectedDate(dISO)} style={{
              textAlign: "center", padding: "8px 2px", borderRadius: 6, cursor: "pointer",
              background: active ? NAVY : "#fff", border: active ? "none" : "1px solid #E3E0D6",
            }}>
              <div style={{ fontSize: 9, color: active ? "#B9C2CC" : "#9A917E" }}>{dayLabels[i]}</div>
              <div style={{ fontSize: 14, color: active ? "#EDE6D8" : INK, margin: "2px 0" }}>{d.getDate()}</div>
              {hasItems && <div style={{ width: 4, height: 4, borderRadius: "50%", background: active ? GOLD : "#B08D57", margin: "0 auto" }} />}
            </div>
          );
        })}
      </div>

      {/* Mês */}
      <div style={{ background: "#fff", border: "1px solid #EAE7DC", borderRadius: 10, padding: 16, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))} style={{ background: "none", border: "none", cursor: "pointer", color: NAVY, fontSize: 14 }}>←</button>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 13.5, color: NAVY, textTransform: "capitalize" }}>
            {viewMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </div>
          <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))} style={{ background: "none", border: "none", cursor: "pointer", color: NAVY, fontSize: 14 }}>→</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, fontSize: 10, textAlign: "center", color: "#9A917E", marginBottom: 4 }}>
          {dayLabels.map((l) => <div key={l}>{l[0]}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
          {gridDays.map((d) => {
            const dISO = iso(d);
            const inMonth = d.getMonth() === viewMonth.getMonth();
            const active = dISO === selectedDate;
            const hasItems = !!itemsByDate[dISO];
            return (
              <div key={dISO} onClick={() => setSelectedDate(dISO)} style={{
                textAlign: "center", padding: "7px 0", borderRadius: 6, cursor: "pointer", fontSize: 11.5,
                background: active ? NAVY : "transparent", color: active ? "#EDE6D8" : inMonth ? INK : "#DDD8C9",
              }}>
                {d.getDate()}
                {hasItems && <div style={{ width: 3.5, height: 3.5, borderRadius: "50%", background: active ? GOLD : "#B08D57", margin: "1px auto 0" }} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Dia selecionado */}
      <SectionCard title={fmtDate(selectedDate)}>
        {dayItems.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nada agendado para este dia.</p>}
        {dayItems.map((it) => (
          <RowCard key={`${it.kind}-${it.id}`}
            onDelete={it.kind === "Google" ? undefined : () => onDeleteTask(it.id)}
            title={it.title}
            subtitle={`${it.extra || "dia todo"}${it.location ? " · " + it.location : ""}${it.done ? " · concluída" : ""}`}
            right={<span style={{
              fontSize: 10.5, padding: "2px 8px", borderRadius: 12,
              background: it.kind === "Tarefa" ? "#F1EFE8" : it.kind === "Google" ? "#E7EEF3" : "#EAF3DE",
              color: it.kind === "Tarefa" ? MUTED : it.kind === "Google" ? "#2A5A78" : "#27500A",
            }}>{it.kind}</span>} />
        ))}
      </SectionCard>
    </>
  );
}
function financeStatus(f) {
  const overdue = !f.settledAt && f.date && f.date < todayISO();
  if (overdue) return "overdue";
  if (f.settledAt) return f.type === "Despesa" ? "paid" : "received";
  return f.type === "Despesa" ? "topay" : "receivable";
}

const STATUS_CHIP = {
  receivable: { label: "a receber", bg: "#f4ecd8", color: "#8a6d3b" },
  received: { label: "recebido", bg: "#e4efe6", color: "#1f6b4a" },
  topay: { label: "a pagar", bg: "#f1ede2", color: "#23201a" },
  paid: { label: "pago", bg: "#f1ede2", color: "#23201a" },
  overdue: { label: "atrasado", bg: "#fdf3f0", color: "#c04a40" },
};

function FinancePrevisaoChart({ finance, onPickMonth, activeMonth }) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + 1 + i, 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, d };
  });
  const byMonth = months.map((m) => {
    const total = finance
      .filter((f) => f.type === "Receita" && !f.settledAt && f.date && f.date.startsWith(m.key))
      .reduce((s, f) => s + Number(f.amount || 0), 0);
    return { ...m, total };
  });
  const maxVal = Math.max(...byMonth.map((m) => m.total), 1);
  let lastYear = now.getFullYear();

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <div style={{ fontFamily: "Georgia, serif", fontSize: 20, fontWeight: 600, color: SIDEBAR_NAVY }}>Previsão dos próximos meses</div>
        <div style={{ fontSize: 13, color: TEXT_META }}>barras claras são valores ainda não confirmados</div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 150, borderBottom: `1px solid ${CARD_BORDER}`, paddingBottom: 0 }}>
        {byMonth.map((m) => {
          const showYear = m.d.getFullYear() !== lastYear || m.d.getMonth() === 0;
          const yearChanged = m.d.getFullYear() !== now.getFullYear();
          lastYear = m.d.getFullYear();
          const h = m.total > 0 ? Math.max(20, Math.round((m.total / maxVal) * 120)) : 0;
          const active = activeMonth === m.key;
          return (
            <div key={m.key} onClick={() => m.total > 0 && onPickMonth(active ? null : m.key)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", cursor: m.total > 0 ? "pointer" : "default" }}>
              {m.total > 0 ? (
                <>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#8a6d3b", marginBottom: 6 }}>{fmtBRL(m.total)}</div>
                  <div style={{
                    width: "100%", maxWidth: 60, height: h, borderRadius: "4px 4px 0 0",
                    background: "repeating-linear-gradient(45deg, #f0e4c6, #f0e4c6 6px, #f7f0dd 6px, #f7f0dd 12px)",
                    border: "1px solid #ddcda0", borderBottom: "none",
                    outline: active ? `2px solid ${GOLD_ACCENT}` : "none",
                  }} />
                </>
              ) : (
                <div style={{ width: "100%", maxWidth: 60, height: 2, background: CARD_BORDER, marginBottom: 26 }} />
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
        {byMonth.map((m) => {
          const label = m.d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
          const withYear = m.d.getMonth() === 0 || m.d.getFullYear() !== now.getFullYear();
          return (
            <div key={m.key} style={{ flex: 1, textAlign: "center", fontSize: 13, color: m.total > 0 ? "#23201a" : TEXT_META, textTransform: "capitalize" }}>
              {label}.{withYear ? ` ${String(m.d.getFullYear()).slice(2)}` : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FinanceTab({ finance, clients, cases, onAdd, onEdit, onDelete, clientName, onOpenCase }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState(null);
  const [search, setSearch] = useState("");

  const withStatus = finance.map((f) => ({ ...f, _status: financeStatus(f) }));
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const yearKey = String(now.getFullYear());

  // Resumo
  const settledThisMonth = withStatus.filter((f) => f.settledAt && f.settledAt.startsWith(monthKey));
  const recebidoMes = settledThisMonth.filter((f) => f.type === "Receita").reduce((s, f) => s + Number(f.amount), 0);
  const pagoMes = settledThisMonth.filter((f) => f.type === "Despesa").reduce((s, f) => s + Number(f.amount), 0);
  const emCaixa = recebidoMes - pagoMes;

  const aReceberItems = withStatus.filter((f) => f.type === "Receita" && !f.settledAt);
  const aReceberTotal = aReceberItems.reduce((s, f) => s + Number(f.amount), 0);
  const proximoAReceber = aReceberItems.filter((f) => f.date).sort((a, b) => a.date.localeCompare(b.date))[0];

  const settledThisYear = withStatus.filter((f) => f.settledAt && f.settledAt.startsWith(yearKey));
  const receitasAno = settledThisYear.filter((f) => f.type === "Receita").reduce((s, f) => s + Number(f.amount), 0);
  const despesasAno = settledThisYear.filter((f) => f.type === "Despesa").reduce((s, f) => s + Number(f.amount), 0);
  const acumuladoAno = receitasAno - despesasAno;

  // Chips
  const chipCounts = {
    all: withStatus.length,
    receivable: withStatus.filter((f) => f.type === "Receita" && !f.settledAt).length,
    received: withStatus.filter((f) => f._status === "received").length,
    expense: withStatus.filter((f) => f.type === "Despesa").length,
  };

  let visible = withStatus;
  if (statusFilter === "receivable") visible = visible.filter((f) => f.type === "Receita" && !f.settledAt);
  else if (statusFilter === "received") visible = visible.filter((f) => f._status === "received");
  else if (statusFilter === "expense") visible = visible.filter((f) => f.type === "Despesa");
  if (monthFilter) visible = visible.filter((f) => f.date && f.date.startsWith(monthFilter));
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    visible = visible.filter((f) => [f.description, f.bankAccount, clientName(f.clientId)].filter(Boolean).some((s) => s.toLowerCase().includes(q)));
  }

  visible = visible.slice().sort((a, b) => {
    const rank = (f) => f._status === "overdue" ? 0 : !f.settledAt ? 1 : 2;
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra < 2) return (a.date || "").localeCompare(b.date || "");
    return (b.settledAt || "").localeCompare(a.settledAt || "");
  });

  const exportCsv = () => {
    const rows = [["Vencimento", "Descrição", "Caso", "Status", "Valor"]];
    visible.forEach((f) => {
      const c = cases.find((cs) => cs.id === f.caseId);
      rows.push([fmtDate(f.date), f.description, c ? c.title : "", STATUS_CHIP[f._status].label, `${f.type === "Despesa" ? "-" : ""}${f.amount}`]);
    });
    const csv = rows.map((r) => r.map((v) => `"${String(v || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "financeiro.csv"; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 600, color: SIDEBAR_NAVY, fontSize: 34, margin: "0 0 4px" }}>Financeiro</h1>
          <p style={{ color: TEXT_SECONDARY, fontSize: 14, margin: 0 }}>Honorários e despesas do escritório.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar lançamento" style={{ border: `1px solid ${DIVIDER}`, background: "#fff", borderRadius: 6, padding: "10px 14px", fontSize: 14, width: 180 }} />
          <button onClick={onAdd} style={{ background: SIDEBAR_NAVY, color: "#f5efe4", border: "none", fontSize: 14, fontWeight: 600, padding: "11px 18px", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap" }}>+ Adicionar</button>
        </div>
      </div>

      {/* Faixa de resumo */}
      <div style={{ background: SIDEBAR_NAVY, borderRadius: 10, padding: "24px 0", display: "flex", marginBottom: 20 }}>
        {[
          { label: `EM CAIXA · ${now.toLocaleDateString("pt-BR", { month: "long" }).toUpperCase()}`, value: fmtBRL(emCaixa), detail: `recebido ${fmtBRL(recebidoMes)} · pago ${fmtBRL(pagoMes)}`, color: "#f5efe4" },
          { label: "A RECEBER", value: fmtBRL(aReceberTotal), detail: `${aReceberItems.length} lançamento(s)${proximoAReceber ? ` · próximo em ${fmtDate(proximoAReceber.date)}` : ""}`, color: GOLD_ACCENT },
          { label: "ACUMULADO NO ANO", value: fmtBRL(acumuladoAno), detail: `receitas ${fmtBRL(receitasAno)} · despesas ${fmtBRL(despesasAno)}`, color: "#f5efe4" },
        ].map((col, i) => (
          <div key={i} style={{ flex: 1, padding: "0 28px", borderLeft: i > 0 ? "1px solid rgba(232,226,213,0.16)" : "none" }}>
            <div style={{ fontSize: 12, letterSpacing: "0.12em", fontWeight: 600, color: "rgba(240,234,221,0.55)", marginBottom: 8 }}>{col.label}</div>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 36, lineHeight: 1, color: col.color, marginBottom: 8 }}>{col.value}</div>
            <div style={{ fontSize: 13, color: "rgba(240,234,221,0.65)" }}>{col.detail}</div>
          </div>
        ))}
      </div>

      {/* Previsão */}
      <div style={{ background: "#fff", border: `1px solid ${CARD_BORDER}`, borderRadius: 8, padding: "22px 24px", marginBottom: 20 }}>
        <FinancePrevisaoChart finance={finance} onPickMonth={setMonthFilter} activeMonth={monthFilter} />
      </div>

      {/* Chips */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        {[
          { id: "all", label: "Tudo" }, { id: "receivable", label: "A receber" },
          { id: "received", label: "Recebido" }, { id: "expense", label: "Despesas" },
        ].map((c) => {
          const active = statusFilter === c.id;
          return (
            <div key={c.id} onClick={() => setStatusFilter(c.id)} style={{
              padding: "8px 15px", borderRadius: 20, fontSize: 13, cursor: "pointer",
              background: active ? "#e8e1d2" : "transparent", color: active ? SIDEBAR_NAVY : TEXT_SECONDARY, fontWeight: active ? 600 : 400,
              border: active ? "none" : `1px solid ${DIVIDER}`,
            }}>{c.label} · {chipCounts[c.id]}</div>
          );
        })}
        <div onClick={exportCsv} style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: GOLD_DARK, cursor: "pointer" }}>Exportar CSV</div>
      </div>

      {/* Lista */}
      {visible.length === 0 ? (
        <div style={{ textAlign: "center", padding: "30px 0" }}>
          <p style={{ fontSize: 15, color: TEXT_META, margin: "0 0 12px" }}>Nenhum lançamento aqui.</p>
          <button onClick={onAdd} style={{ background: "#fff", border: `1px solid ${CARD_BORDER}`, color: SIDEBAR_NAVY, fontSize: 13, fontWeight: 600, padding: "9px 16px", borderRadius: 6, cursor: "pointer" }}>Adicionar lançamento</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visible.map((f) => {
            const c = cases.find((cs) => cs.id === f.caseId);
            const chip = STATUS_CHIP[f._status];
            const valueColor = f.type === "Despesa" ? "#c04a40" : f._status === "received" ? "#23201a" : "#1f6b4a";
            const subtitleParts = [clientName(f.clientId) !== "—" ? clientName(f.clientId) : null, f.bankAccount].filter(Boolean);
            return (
              <div key={f.id} style={{ background: "#fff", border: `1px solid ${CARD_BORDER}`, borderRadius: 8, padding: "15px 18px", display: "flex", alignItems: "center", gap: 16, opacity: f.settledAt ? 0.8 : 1 }}>
                <div style={{ width: 84, flexShrink: 0, fontSize: 14, color: "#23201a" }}>{fmtDate(f.date)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, color: "#23201a" }}>{f.description}</div>
                  {subtitleParts.length > 0 && <div style={{ fontSize: 13, color: TEXT_META, marginTop: 2 }}>{subtitleParts.join(" · ")}</div>}
                </div>
                <div style={{ width: 150, flexShrink: 0 }}>
                  {c ? (
                    <span onClick={() => onOpenCase(c.id)} style={{ fontSize: 13, color: GOLD_DARK, cursor: "pointer" }}>{c.title} ›</span>
                  ) : (
                    <span onClick={() => onEdit(f)} style={{ fontSize: 13, color: TEXT_META, cursor: "pointer" }}>Vincular a um caso</span>
                  )}
                </div>
                <div style={{ width: 110, flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: chip.bg, color: chip.color }}>{chip.label}</span>
                </div>
                <div style={{ width: 130, flexShrink: 0, textAlign: "right", fontFamily: "Georgia, serif", fontSize: 20, color: valueColor }}>
                  {f.type === "Despesa" ? "−" : ""}{fmtBRL(f.amount)}
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button onClick={() => onEdit(f)} style={{ background: "none", border: "none", cursor: "pointer", color: ICON_INACTIVE, padding: 10 }}><Pencil size={15} /></button>
                  <button onClick={() => onDelete(f.id)} style={{ background: "none", border: "none", cursor: "pointer", color: ICON_INACTIVE, padding: 10 }}><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function IntakeReviewTab({ onUseSubmission }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [links, setLinks] = useState({});

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("client_intake").select("*").eq("status", "pendente").order("created_at", { ascending: false });
    setItems(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const getLink = async (path) => {
    if (!path || links[path]) return;
    const { data } = await supabase.storage.from("client-intake").createSignedUrl(path, 3600);
    if (data?.signedUrl) setLinks((prev) => ({ ...prev, [path]: data.signedUrl }));
  };

  const markProcessed = async (id) => {
    await supabase.from("client_intake").update({ status: "processado" }).eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };
  const remove = async (id) => {
    await supabase.from("client_intake").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const FileLink = ({ path, label }) => {
    if (!path) return null;
    return (
      <a href={links[path] || "#"} onClick={(e) => { if (!links[path]) { e.preventDefault(); getLink(path); } }} target="_blank" rel="noreferrer"
        style={{ fontSize: 12, color: NAVY, border: "1px solid #E3E0D6", borderRadius: 6, padding: "5px 10px", textDecoration: "none", marginRight: 6, display: "inline-block", marginTop: 6 }}>
        {links[path] ? `Abrir ${label} ↗` : `Gerar link — ${label}`}
      </a>
    );
  };

  return (
    <>
      <h1 style={{ fontFamily: "Georgia, serif", color: NAVY, fontSize: 24, margin: "0 0 4px" }}>Cadastros pendentes</h1>
      <p style={{ color: MUTED, fontSize: 13.5, margin: "0 0 20px" }}>Fichas enviadas pelo formulário público, aguardando revisão.</p>
      {loading && <p style={{ color: MUTED, fontSize: 13 }}>Carregando…</p>}
      {!loading && items.length === 0 && <Empty text="Nenhum cadastro pendente no momento." />}
      {items.map((i) => (
        <SectionCard key={i.id} title={i.name}>
          <InfoRow label="Tipo" value={i.type === "PJ" ? "Pessoa jurídica" : "Pessoa física"} />
          <InfoRow label={i.type === "PJ" ? "CNPJ" : "CPF"} value={i.cpf_cnpj} />
          {i.type === "PF" && <InfoRow label="RG" value={i.rg ? `${i.rg}${i.orgao_expedidor_rg ? " " + i.orgao_expedidor_rg : ""}` : null} />}
          {i.type === "PF" && <InfoRow label="Nacionalidade" value={i.nacionalidade} />}
          {i.type === "PF" && <InfoRow label="Estado civil" value={i.estado_civil} />}
          {i.type === "PF" && <InfoRow label="Profissão" value={i.profissao} />}
          {i.type === "PJ" && <InfoRow label="Representante legal" value={i.representante_legal} />}
          <InfoRow label="Endereço" value={i.address} />
          <InfoRowEmail label="E-mail" value={i.email} />
          <InfoRow label="Telefone" value={i.phone} />
          <InfoRow label="Enviado em" value={fmtDate(i.created_at?.slice(0, 10))} />
          <div style={{ marginTop: 6 }}>
            <FileLink path={i.doc_identidade_path} label="documento de identidade" />
            <FileLink path={i.comprovante_residencia_path} label="comprovante de residência" />
            <FileLink path={i.cartao_cnpj_path} label="cartão CNPJ" />
            <FileLink path={i.contrato_social_path} label="contrato social" />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={() => onUseSubmission(i)} style={{ background: NAVY, color: "#EDE6D8", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 12.5, cursor: "pointer" }}>Cadastrar como contato</button>
            <button onClick={() => markProcessed(i.id)} style={{ background: "#fff", border: "1px solid #E3E0D6", borderRadius: 6, padding: "8px 14px", fontSize: 12.5, color: NAVY, cursor: "pointer" }}>Marcar como processado</button>
            <button onClick={() => remove(i.id)} style={{ background: "none", border: "none", color: "#C0997B", cursor: "pointer", padding: "8px" }}><Trash2 size={15} /></button>
          </div>
        </SectionCard>
      ))}
    </>
  );
}

function NewsletterTab({ clients, newsletters, onSave, onDelete }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [scheduledFor, setScheduledFor] = useState(todayISO());
  const [error, setError] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [testBusy, setTestBusy] = useState(null);
  const [testMsg, setTestMsg] = useState(null);
  const optedInCount = clients.filter((c) => c.newsletterOptIn !== false && c.email).length;

  const sendTest = async (newsletterId) => {
    setTestMsg(null);
    if (!testEmail.trim()) { setTestMsg({ ok: false, text: "Informe um e-mail para o teste." }); return; }
    setTestBusy(newsletterId);
    try {
      const resp = await fetch("https://jrcojsnjxuykdczbqfuo.supabase.co/functions/v1/send-newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test_email: testEmail.trim(), newsletter_id: newsletterId }),
      });
      const data = await resp.json();
      if (resp.ok && data.sent) setTestMsg({ ok: true, text: `Teste enviado para ${testEmail.trim()}.` });
      else setTestMsg({ ok: false, text: `Falha no envio (status ${data.status}): ${data.resend_response || data.error || "sem detalhes"}` });
    } catch (e) {
      setTestMsg({ ok: false, text: "Falha de conexão ao enviar o teste." });
    }
    setTestBusy(null);
  };

  const [bodyImageUrl, setBodyImageUrl] = useState("");
  const [highlightTitle, setHighlightTitle] = useState("");
  const [highlightText, setHighlightText] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaLink, setCtaLink] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfFilename, setPdfFilename] = useState("");

  const submit = () => {
    if (!subject.trim() || !body.trim() || !scheduledFor) { setError("Preencha assunto, conteúdo e data de envio."); return; }
    setError("");
    onSave({
      subject: subject.trim(), htmlBody: body.trim(), scheduledFor,
      bodyImageUrl: bodyImageUrl.trim(), highlightTitle: highlightTitle.trim(), highlightText: highlightText.trim(),
      ctaText: ctaText.trim(), ctaLink: ctaLink.trim(), pdfUrl: pdfUrl.trim(), pdfFilename: pdfFilename.trim(),
    });
    setSubject(""); setBody(""); setBodyImageUrl(""); setHighlightTitle(""); setHighlightText(""); setCtaText(""); setCtaLink(""); setPdfUrl(""); setPdfFilename("");
  };

  return (
    <>
      <h1 style={{ fontFamily: "Georgia, serif", color: NAVY, fontSize: 24, margin: "0 0 4px" }}>Newsletter</h1>
      <p style={{ color: MUTED, fontSize: 13.5, margin: "0 0 20px" }}>
        Visível somente para administradores. Enviada automaticamente na data agendada para {optedInCount} cliente(s) com recebimento ativado.
      </p>

      <SectionCard title="Nova edição">
        <Field label="Assunto do e-mail"><input style={inputStyle} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex: Novidades tributárias — Setembro" /></Field>
        <Field label="Conteúdo (cada parágrafo em uma linha)">
          <textarea style={{ ...inputStyle, minHeight: 160, resize: "vertical", fontFamily: "inherit" }}
            value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escreva o conteúdo da newsletter deste mês…" />
        </Field>
        <Field label="Imagem no corpo do e-mail (opcional, link público da imagem)">
          <input style={inputStyle} value={bodyImageUrl} onChange={(e) => setBodyImageUrl(e.target.value)} placeholder="https://.../imagem.jpg" />
        </Field>
        <Field label="Título da caixa de destaque (opcional)"><input style={inputStyle} value={highlightTitle} onChange={(e) => setHighlightTitle(e.target.value)} placeholder="Ex: Prazo para agir" /></Field>
        <Field label="Texto da caixa de destaque (opcional)">
          <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
            value={highlightText} onChange={(e) => setHighlightText(e.target.value)} placeholder="Texto curto que aparece destacado…" />
        </Field>
        <Field label="Texto do botão (opcional)"><input style={inputStyle} value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="Ex: Agendar uma conversa" /></Field>
        <Field label="Link do botão (opcional)"><input style={inputStyle} value={ctaLink} onChange={(e) => setCtaLink(e.target.value)} placeholder="https://wa.me/... ou mailto:..." /></Field>
        <Field label="PDF anexo (opcional, link público do arquivo)"><input style={inputStyle} value={pdfUrl} onChange={(e) => setPdfUrl(e.target.value)} placeholder="https://.../informativo-rsac.pdf" /></Field>
        <Field label="Nome do arquivo anexado"><input style={inputStyle} value={pdfFilename} onChange={(e) => setPdfFilename(e.target.value)} placeholder="Informativo-RSAC-Setembro-2026.pdf" /></Field>
        <Field label="Data de envio"><input type="date" style={inputStyle} value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} /></Field>
        {error && <div style={{ color: "#993D1D", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={submit} style={{ background: NAVY, color: "#EDE6D8", border: "none", borderRadius: 6, padding: "9px 16px", fontSize: 13, cursor: "pointer" }}>Agendar envio</button>
        </div>
      </SectionCard>

      <SectionCard title={`Edições (${newsletters.length})`}>
        <Field label="E-mail para teste"><input style={inputStyle} value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="seuemail@gmail.com" /></Field>
        {testMsg && <div style={{ fontSize: 12, color: testMsg.ok ? "#27500A" : "#993D1D", marginBottom: 10 }}>{testMsg.text}</div>}
        {newsletters.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhuma newsletter agendada ainda.</p>}
        {newsletters.map((n) => (
          <RowCard key={n.id} title={n.subject} subtitle={`Envio em ${fmtDate(n.scheduled_for)}${n.sent ? " · enviada" : " · agendada"}`}
            right={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => sendTest(n.id)} disabled={testBusy === n.id} style={{ background: "#fff", border: "1px solid #E3E0D6", borderRadius: 6, padding: "5px 10px", fontSize: 11.5, color: NAVY, cursor: "pointer" }}>
                  {testBusy === n.id ? "Enviando…" : "Enviar teste"}
                </button>
                <Badge text={n.sent ? "Encerrado" : "Ativo"} />
              </div>
            }
            onDelete={n.sent ? undefined : () => onDelete(n.id)} />
        ))}
      </SectionCard>
    </>
  );
}

function IntakeForm() {
  const [type, setType] = useState("PF");
  const [name, setName] = useState(""); const [cpfCnpj, setCpfCnpj] = useState("");
  const [rg, setRg] = useState(""); const [orgaoExpedidorRg, setOrgaoExpedidorRg] = useState("");
  const [nacionalidade, setNacionalidade] = useState("brasileiro(a)"); const [estadoCivil, setEstadoCivil] = useState("");
  const [profissao, setProfissao] = useState(""); const [representanteLegal, setRepresentanteLegal] = useState("");
  const [address, setAddress] = useState(""); const [email, setEmail] = useState(""); const [phone, setPhone] = useState("");
  const [docIdentidade, setDocIdentidade] = useState(null); const [comprovanteResidencia, setComprovanteResidencia] = useState(null);
  const [cartaoCnpj, setCartaoCnpj] = useState(null); const [contratoSocial, setContratoSocial] = useState(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [done, setDone] = useState(false);

  const uploadFile = async (file, label) => {
    if (!file) return null;
    const ext = file.name.split(".").pop();
    const path = `${crypto.randomUUID()}/${label}.${ext}`;
    const { error } = await supabase.storage.from("client-intake").upload(path, file);
    if (error) throw new Error(`Falha ao enviar ${label}: ${error.message}`);
    return path;
  };

  const submit = async () => {
    setError("");
    if (!name.trim()) { setError("Informe seu nome completo ou razão social."); return; }
    setBusy(true);
    try {
      const [docIdentidadePath, comprovanteResidenciaPath, cartaoCnpjPath, contratoSocialPath] = await Promise.all([
        uploadFile(docIdentidade, "documento_identidade"),
        uploadFile(comprovanteResidencia, "comprovante_residencia"),
        uploadFile(cartaoCnpj, "cartao_cnpj"),
        uploadFile(contratoSocial, "contrato_social"),
      ]);
      const { error: insertError } = await supabase.from("client_intake").insert([{
        type, name: name.trim(), cpf_cnpj: cpfCnpj, rg: type === "PF" ? rg : null,
        orgao_expedidor_rg: type === "PF" ? orgaoExpedidorRg : null,
        nacionalidade: type === "PF" ? nacionalidade : null, estado_civil: type === "PF" ? estadoCivil : null,
        profissao: type === "PF" ? profissao : null, representante_legal: type === "PJ" ? representanteLegal : null,
        address, email, phone,
        doc_identidade_path: docIdentidadePath, comprovante_residencia_path: comprovanteResidenciaPath,
        cartao_cnpj_path: cartaoCnpjPath, contrato_social_path: contratoSocialPath,
      }]);
      if (insertError) throw new Error(insertError.message);
      setDone(true);
    } catch (e) {
      setError(e.message || "Não foi possível enviar o cadastro. Tente novamente.");
    }
    setBusy(false);
  };

  if (done) {
    return (
      <div style={{ minHeight: "100vh", background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: CREAM, borderRadius: 10, padding: "40px 32px", maxWidth: 420, textAlign: "center" }}>
          <div style={{ marginBottom: 20 }}><Logo dark={false} /></div>
          <h2 style={{ fontFamily: "Georgia, serif", color: NAVY, fontSize: 20, margin: "0 0 10px" }}>Cadastro enviado com sucesso!</h2>
          <p style={{ color: MUTED, fontSize: 14 }}>Obrigado. Recebemos suas informações e documentos. Nossa equipe entrará em contato em breve.</p>
        </div>
      </div>
    );
  }

  const fileLabel = (f) => f ? f.name : "Nenhum arquivo selecionado";

  return (
    <div style={{ minHeight: "100vh", background: NAVY, padding: "32px 16px" }}>
      <div style={{ background: CREAM, borderRadius: 10, padding: "32px 26px", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}><Logo dark={false} /></div>
        <h1 style={{ fontFamily: "Georgia, serif", color: NAVY, fontSize: 20, margin: "0 0 6px", textAlign: "center" }}>Ficha de cadastro de cliente</h1>
        <p style={{ color: MUTED, fontSize: 13, textAlign: "center", margin: "0 0 24px" }}>Preencha os dados abaixo e anexe os documentos solicitados.</p>

        <Field label="Tipo">
          <div style={{ display: "flex", gap: 8 }}>
            {[{ v: "PF", l: "Pessoa física" }, { v: "PJ", l: "Pessoa jurídica" }].map((o) => (
              <div key={o.v} onClick={() => setType(o.v)} style={{
                flex: 1, textAlign: "center", padding: "10px 6px", borderRadius: 6, cursor: "pointer",
                border: type === o.v ? "1.5px solid #B08D57" : "1px solid #E3E0D6",
                background: type === o.v ? "rgba(176,141,87,0.1)" : "#fff",
                fontSize: 13, color: type === o.v ? NAVY : MUTED,
              }}>{o.l}</div>
            ))}
          </div>
        </Field>

        <Field label={type === "PJ" ? "Razão social" : "Nome completo"}><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={type === "PJ" ? "CNPJ" : "CPF"}><input style={inputStyle} value={cpfCnpj} onChange={(e) => setCpfCnpj(e.target.value)} /></Field>

        {type === "PF" ? (
          <>
            <Field label="RG"><input style={inputStyle} value={rg} onChange={(e) => setRg(e.target.value)} /></Field>
            <Field label="Órgão expedidor do RG"><input style={inputStyle} value={orgaoExpedidorRg} onChange={(e) => setOrgaoExpedidorRg(e.target.value)} placeholder="Ex: SSP/SP" /></Field>
            <Field label="Nacionalidade"><input style={inputStyle} value={nacionalidade} onChange={(e) => setNacionalidade(e.target.value)} /></Field>
            <Field label="Estado civil"><input style={inputStyle} value={estadoCivil} onChange={(e) => setEstadoCivil(e.target.value)} placeholder="Ex: casado(a)" /></Field>
            <Field label="Profissão"><input style={inputStyle} value={profissao} onChange={(e) => setProfissao(e.target.value)} /></Field>
          </>
        ) : (
          <Field label="Representante legal (nome e qualificação)"><input style={inputStyle} value={representanteLegal} onChange={(e) => setRepresentanteLegal(e.target.value)} /></Field>
        )}

        <Field label="Endereço completo"><input style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua, número, bairro, cidade – UF, CEP" /></Field>
        <Field label="E-mail"><input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Telefone / WhatsApp"><input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>

        <div style={{ height: 1, background: "#E3E0D6", margin: "18px 0" }} />
        <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 12 }}>Documentos (fotos ou PDF)</div>

        {type === "PF" ? (
          <Field label="Documento de identidade (RG ou CNH)">
            <input type="file" accept="image/*,.pdf" onChange={(e) => setDocIdentidade(e.target.files[0])} style={{ fontSize: 12.5 }} />
          </Field>
        ) : (
          <>
            <Field label="Cartão CNPJ">
              <input type="file" accept="image/*,.pdf" onChange={(e) => setCartaoCnpj(e.target.files[0])} style={{ fontSize: 12.5 }} />
            </Field>
            <Field label="Contrato social (última alteração consolidada)">
              <input type="file" accept="image/*,.pdf" onChange={(e) => setContratoSocial(e.target.files[0])} style={{ fontSize: 12.5 }} />
            </Field>
          </>
        )}
        <Field label="Comprovante de residência">
          <input type="file" accept="image/*,.pdf" onChange={(e) => setComprovanteResidencia(e.target.files[0])} style={{ fontSize: 12.5 }} />
        </Field>

        {error && <div style={{ color: "#993D1D", fontSize: 12.5, margin: "10px 0" }}>{error}</div>}
        <button onClick={submit} disabled={busy} style={{ width: "100%", background: NAVY, color: "#EDE6D8", border: "none", borderRadius: 6, padding: "12px 16px", fontSize: 14, cursor: "pointer", marginTop: 10 }}>
          {busy ? "Enviando…" : "Enviar cadastro"}
        </button>
      </div>
    </div>
  );
}

function ClientPortalView({ data, onExit }) {
  const [viewCaseId, setViewCaseId] = useState(null);
  const { client, cases, events, documents } = data;
  const viewingCase = cases.find((c) => c.id === viewCaseId);

  return (
    <div style={{ minHeight: 560, background: CREAM, borderRadius: 10, border: "1px solid #EAE7DC", padding: "28px 32px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.5, color: "#9A917E", textTransform: "uppercase" }}>Portal do cliente</div>
          <h1 style={{ fontFamily: "Georgia, serif", color: NAVY, fontSize: 22, margin: "4px 0 0" }}>Olá, {client.name.split(" ")[0]}</h1>
        </div>
        <button onClick={onExit} style={{ background: "none", border: "1px solid #E3E0D6", borderRadius: 6, padding: "7px 14px", fontSize: 12.5, color: MUTED, cursor: "pointer" }}>Sair</button>
      </div>

      {viewingCase ? (
        <>
          <button onClick={() => setViewCaseId(null)} style={{ background: "none", border: "none", color: MUTED, fontSize: 12.5, cursor: "pointer", padding: 0, marginBottom: 14 }}>← Voltar aos meus casos</button>
          <SectionCard title={viewingCase.title}>
            <InfoRow label="Status" value={viewingCase.status} />
            {viewingCase.number && <InfoRow label="Número" value={viewingCase.number} />}
            {viewingCase.area && <InfoRow label="Área" value={viewingCase.area} />}
            {viewingCase.tribunal && <InfoRow label="Tribunal" value={viewingCase.tribunal} />}
            {viewingCase.comarca && <InfoRow label="Comarca" value={viewingCase.comarca} />}
            {viewingCase.vara && <InfoRow label="Vara" value={viewingCase.vara} />}
          </SectionCard>
          <SectionCard title="Andamento">
            <Timeline
              events={events.filter((e) => e.caseId === viewingCase.id || e.case_id === viewingCase.id).map((e) => ({ id: e.id, date: e.event_date || e.date, description: e.description }))}
              onDelete={() => {}}
            />
          </SectionCard>
          <SectionCard title="Documentos">
            {documents.filter((d) => (d.caseId || d.case_id) === viewingCase.id).length === 0 && (
              <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhum documento disponibilizado ainda.</p>
            )}
            {documents.filter((d) => (d.caseId || d.case_id) === viewingCase.id).map((d) => (
              <div key={d.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F1EFE8" }}>
                <span style={{ fontSize: 13, color: INK }}>{d.name}</span>
                {(d.driveLink || d.drive_link) && <a href={d.driveLink || d.drive_link} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: NAVY }}>Abrir ↗</a>}
              </div>
            ))}
          </SectionCard>
        </>
      ) : (
        <SectionCard title={`Seus casos (${cases.length})`}>
          {cases.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhum caso vinculado no momento.</p>}
          {cases.map((c) => (
            <RowCard key={c.id} onClick={() => setViewCaseId(c.id)} title={c.title} subtitle={`${c.number || "sem número"}${c.area ? " · " + c.area : ""}`} right={<Badge text={c.status} />} />
          ))}
        </SectionCard>
      )}
    </div>
  );
}

export default function RSACApp() {
  const [session, setSession] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 900);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [mobileTaskFilter, setMobileTaskFilter] = useState("abertas");
  const [clients, setClients] = useState([]);
  const [cases, setCases] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [appts, setAppts] = useState([]);
  const [finance, setFinance] = useState([]);
  const [events, setEvents] = useState([]);
  const [notes, setNotes] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [precedents, setPrecedents] = useState([]);
  const [monthlyGoal, setMonthlyGoal] = useState(0);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [folderCaseId, setFolderCaseId] = useState(null);
  const [financeContext, setFinanceContext] = useState(null);
  const [editingClient, setEditingClient] = useState(null);
  const [prefillClient, setPrefillClient] = useState(null);
  const [editingCase, setEditingCase] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [editingFinance, setEditingFinance] = useState(null);
  const [viewClient, setViewClient] = useState(null);
  const [contactGroup, setContactGroup] = useState(null);
  const [activeCaseId, setActiveCaseId] = useState(null);
  const [showMoreNav, setShowMoreNav] = useState(false);
  const [hoveredNavId, setHoveredNavId] = useState(null);
  const [hoveredCaseItemId, setHoveredCaseItemId] = useState(null);
  const [taskDayFilter, setTaskDayFilter] = useState(null);
  const [googleToken, setGoogleToken] = useState(null);
  const [expandedCaseClient, setExpandedCaseClient] = useState(null);
  const [viewCase, setViewCase] = useState(null);
  const [role, setRole] = useState(null);
  const [newsletters, setNewsletters] = useState([]);
  const [portalData, setPortalData] = useState(null);
  const [caseTypesCatalog, setCaseTypesCatalog] = useState([]);
  const [caseTypesByCaseId, setCaseTypesByCaseId] = useState({});
  const [currentUserName, setCurrentUserName] = useState("Você");
  const [taskPrefill, setTaskPrefill] = useState(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    loadAll().then(async (d) => {
      setClients(d.clients); setCases(d.cases); setTasks(d.tasks); setAppts(d.appts); setFinance(d.finance);
      setEvents(d.events); setNotes(d.notes); setDocuments(d.documents); setPrecedents(d.precedents);
      setMonthlyGoal(d.monthlyGoal || 0);
      const { catalog, byCaseId } = await fetchCaseTypesData();
      setCaseTypesCatalog(catalog); setCaseTypesByCaseId(byCaseId);
      const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", session.user.id).single();
      const r = profile?.role || "staff";
      setRole(r);
      setCurrentUserName(profile?.full_name || session.user.email || "Você");
      if (r === "admin") {
        const { data: nl } = await supabase.from("newsletters").select("*").order("scheduled_for", { ascending: false });
        setNewsletters(nl || []);
      }
      setLoading(false);
    });
  }, [session]);

  const setters = { clients: setClients, cases: setCases, tasks: setTasks, appts: setAppts, finance: setFinance, events: setEvents, notes: setNotes, documents: setDocuments, precedents: setPrecedents };
  const state = { clients, cases, tasks, appts, finance, events, notes, documents, precedents };

  const addRow = useCallback(async (key, row) => {
    const saved = await insertRow(key, row);
    if (saved) setters[key]((prev) => [...prev, saved]);
  }, [clients, cases, tasks, appts, finance]);

  const handleAddCaseType = useCallback(async (caseId, name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    let type = caseTypesCatalog.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (!type) {
      type = await createCaseType(trimmed, caseTypesCatalog.length);
      if (!type) return;
      setCaseTypesCatalog((prev) => [...prev, type]);
    }
    const already = (caseTypesByCaseId[caseId] || []).some((t) => t.id === type.id);
    if (already) return;
    await linkCaseType(caseId, type.id);
    setCaseTypesByCaseId((prev) => ({ ...prev, [caseId]: [...(prev[caseId] || []), type] }));
  }, [caseTypesCatalog, caseTypesByCaseId]);

  const handleRemoveCaseType = useCallback(async (caseId, typeId) => {
    await unlinkCaseType(caseId, typeId);
    setCaseTypesByCaseId((prev) => ({ ...prev, [caseId]: (prev[caseId] || []).filter((t) => t.id !== typeId) }));
  }, []);

  const handleAddNote = useCallback(async (caseId, values) => {
    const saved = await insertRow("notes", { ...values, caseId, authorId: session?.user?.id || null, authorName: currentUserName });
    if (saved) setNotes((prev) => [...prev, saved]);
  }, [session, currentUserName]);

  const handleEditNoteContent = useCallback(async (noteId, patch) => {
    const current = notes.find((n) => n.id === noteId);
    if (!current) return;
    const merged = { ...current, ...patch, updatedAt: new Date().toISOString() };
    const saved = await editRow("notes", noteId, merged);
    if (saved) setNotes((prev) => prev.map((n) => (n.id === noteId ? saved : n)));
  }, [notes]);

  const handleTogglePinNote = useCallback(async (note) => {
    const otherPinned = notes.find((n) => n.caseId === note.caseId && n.pinned && n.id !== note.id);
    const nextPinned = !note.pinned;
    if (otherPinned) await updateRow("notes", otherPinned.id, { pinned: false });
    await updateRow("notes", note.id, { pinned: nextPinned });
    setNotes((prev) => prev.map((n) => {
      if (n.id === note.id) return { ...n, pinned: nextPinned };
      if (otherPinned && n.id === otherPinned.id) return { ...n, pinned: false };
      return n;
    }));
  }, [notes]);

  const handleCreateTaskFromNote = useCallback((note, selectedText) => {
    setFolderCaseId(note.caseId);
    setTaskPrefill({ title: selectedText, sourceNoteId: note.id });
    setModal("task");
  }, []);

  const addTaskWithSync = useCallback(async (values) => {
    const saved = await insertRow("tasks", values);
    if (!saved) return;
    setTasks((prev) => [...prev, saved]);
    if (saved.time && googleToken) {
      const ok = await pushEventToGoogle(googleToken, { title: saved.title, date: saved.dueDate, time: saved.time, location: saved.location });
      if (ok) {
        const updated = await editRow("tasks", saved.id, { ...saved, googleSynced: true });
        if (updated) setTasks((prev) => prev.map((t) => t.id === saved.id ? updated : t));
      }
    }
  }, [googleToken]);

  const syncAllTasks = useCallback(async () => {
    if (!googleToken) return { total: 0, ok: 0 };
    const pending = tasks.filter((t) => t.time && !t.googleSynced);
    let okCount = 0;
    for (const t of pending) {
      const ok = await pushEventToGoogle(googleToken, { title: t.title, date: t.dueDate, time: t.time, location: t.location }, true);
      if (ok) {
        okCount++;
        const updated = await editRow("tasks", t.id, { ...t, googleSynced: true });
        if (updated) setTasks((prev) => prev.map((x) => x.id === t.id ? updated : x));
      }
    }
    alert(`Sincronização concluída: ${okCount} de ${pending.length} compromisso(s) enviados ao Google Agenda.`);
    return { total: pending.length, ok: okCount };
  }, [googleToken, tasks]);

  const removeRow = useCallback(async (key, id) => {
    setters[key]((prev) => prev.filter((r) => r.id !== id));
    await deleteRow(key, id);
  }, []);

  const editClientRow = useCallback(async (id, values) => {
    const updated = await editRow("clients", id, values);
    if (updated) {
      setClients((prev) => prev.map((c) => c.id === id ? updated : c));
      setViewClient((v) => (v && v.id === id ? updated : v));
    }
  }, []);

  const editCaseRow = useCallback(async (id, values) => {
    const updated = await editRow("cases", id, values);
    if (updated) {
      setCases((prev) => prev.map((c) => c.id === id ? updated : c));
      setViewCase((v) => (v && v.id === id ? updated : v));
    }
  }, []);

  const editTaskRow = useCallback(async (id, values) => {
    const updated = await editRow("tasks", id, values);
    if (updated) setTasks((prev) => prev.map((t) => t.id === id ? updated : t));
  }, []);

  const editFinanceRow = useCallback(async (id, values) => {
    const updated = await editRow("finance", id, values);
    if (updated) setFinance((prev) => prev.map((f) => f.id === id ? updated : f));
  }, []);

  const addFinanceRecurring = useCallback(async (values, months) => {
    const group = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
    const baseDate = new Date(values.date + "T00:00:00");
    for (let i = 0; i < months; i++) {
      const d = new Date(baseDate);
      d.setMonth(d.getMonth() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const saved = await insertRow("finance", { ...values, date: dateStr, recurrenceGroup: group });
      if (saved) setFinance((prev) => [...prev, saved]);
    }
  }, []);

  const addTaskRecurring = useCallback(async (values, every, unit, times) => {
    const group = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
    const baseDate = new Date(values.dueDate + "T00:00:00");
    for (let i = 0; i < times; i++) {
      const d = new Date(baseDate);
      if (unit === "day") d.setDate(d.getDate() + every * i);
      else if (unit === "week") d.setDate(d.getDate() + every * 7 * i);
      else d.setMonth(d.getMonth() + every * i);
      const dateStr = d.toISOString().slice(0, 10);
      const saved = await insertRow("tasks", { ...values, dueDate: dateStr, recurrenceGroup: group });
      if (saved) setTasks((prev) => [...prev, saved]);
    }
  }, []);

  const removeClientAndClose = (id) => { removeRow("clients", id); setViewClient(null); };
  const removeCaseAndClose = (id) => { removeRow("cases", id); setViewCase(null); };

  const goToTab = (id) => { setTab(id); setViewClient(null); setViewCase(null); setActiveCaseId(null); setContactGroup(null); setSearch(""); };
  const openCase = (id) => { setActiveCaseId(id); setViewClient(null); setViewCase(null); };

  const toggleTask = useCallback(async (id) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const newDone = !t.done;
    const completedAt = newDone ? todayISO() : null;
    setTasks((prev) => prev.map((x) => x.id === id ? { ...x, done: newDone, completedAt } : x));
    await updateRow("tasks", id, { done: newDone, completed_at: completedAt });
  }, [tasks]);

  const clientName = (id) => clients.find((c) => c.id === id)?.name || "—";
  const useSubmission = (i) => {
    setPrefillClient({
      name: i.name, type: i.type, cpfCnpj: i.cpf_cnpj, rg: i.rg, orgaoExpedidorRg: i.orgao_expedidor_rg,
      nacionalidade: i.nacionalidade, estadoCivil: i.estado_civil, profissao: i.profissao,
      representanteLegal: i.representante_legal, address: i.address, email: i.email, phone: i.phone,
      contactType: "Cliente",
    });
    setEditingClient(null);
    setModal("client");
  };

  const openTasks = tasks.filter((t) => !t.done).length;
  const activeCases = cases.filter((c) => c.status === "Ativo").length;
  const upcomingAppts = tasks
    .filter((t) => t.time && t.dueDate && t.dueDate >= todayISO())
    .map((t) => ({ id: t.id, date: t.dueDate, title: t.title, time: t.time, location: t.location }))
    .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")))
    .slice(0, 5);
  const recentCases = [...cases].slice(-6).reverse();
  const receitas = finance.filter((f) => f.type === "Receita").reduce((s, f) => s + Number(f.amount || 0), 0);
  const despesas = finance.filter((f) => f.type === "Despesa").reduce((s, f) => s + Number(f.amount || 0), 0);

  const NAV = [
    { id: "dashboard", label: "Painel", icon: LayoutDashboard },
    { id: "tasks", label: "Todas as tarefas", icon: CheckSquare },
    { id: "calendar", label: "Agenda", icon: CalendarIcon },
    { id: "finance", label: "Financeiro", icon: Wallet },
  ];
  const SECONDARY_NAV = [
    { id: "clients", label: "Contatos", icon: Users },
    { id: "cases", label: "Todos os casos", icon: Briefcase },
    { id: "intake", label: "Cadastros pendentes", icon: CheckSquare },
    ...(role === "admin" ? [{ id: "newsletter", label: "Newsletter", icon: Mail }] : []),
  ];
  const activeCasesList = cases
    .filter((c) => c.status === "Ativo")
    .map((c) => ({ ...c, deadline: caseDeadlineInfo(c, tasks) }))
    .sort((a, b) => {
      const order = { overdue: 0, today: 1, upcoming: 2, none: 3 };
      const byStatus = order[a.deadline.status] - order[b.deadline.status];
      if (byStatus !== 0) return byStatus;
      if (a.deadline.nextDueDate && b.deadline.nextDueDate) return a.deadline.nextDueDate.localeCompare(b.deadline.nextDueDate);
      if (a.deadline.nextDueDate) return -1;
      if (b.deadline.nextDueDate) return 1;
      return (a.title || "").localeCompare(b.title || "", "pt-BR");
    })
    .slice(0, 8);

  const saveNewsletter = async (values) => {
    const { data, error } = await supabase.from("newsletters").insert([{
      subject: values.subject, html_body: values.htmlBody, scheduled_for: values.scheduledFor,
      body_image_url: values.bodyImageUrl || null,
      highlight_title: values.highlightTitle || null,
      highlight_text: values.highlightText || null,
      cta_text: values.ctaText || null,
      cta_link: values.ctaLink || null,
      pdf_url: values.pdfUrl || null,
      pdf_filename: values.pdfFilename || null,
    }]).select();
    if (!error && data) setNewsletters((prev) => [data[0], ...prev]);
  };

  const deleteNewsletter = async (id) => {
    setNewsletters((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("newsletters").delete().eq("id", id);
  };

  const toggleOptIn = async (client) => {
    const updated = await editRow("clients", client.id, { ...client, newsletterOptIn: !client.newsletterOptIn });
    if (updated) {
      setClients((prev) => prev.map((c) => c.id === client.id ? updated : c));
      setViewClient((v) => (v && v.id === client.id ? updated : v));
    }
  };

  const saveMonthlyGoal = async (value) => {
    setMonthlyGoal(value);
    await supabase.from("finance_settings").update({ monthly_goal: value }).eq("id", 1);
  };

  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("cadastro") === "1") {
    return <IntakeForm />;
  }

  if (portalData) {
    return <ClientPortalView data={portalData} onExit={() => setPortalData(null)} />;
  }

  if (session === undefined) {
    return <div style={{ padding: 40, textAlign: "center", color: MUTED, fontFamily: "Georgia, serif" }}>Carregando…</div>;
  }
  if (!session) return <LoginScreen onClientPortalAccess={setPortalData} />;
  if (loading) return <div style={{ padding: 40, textAlign: "center", color: MUTED, fontFamily: "Georgia, serif" }}>Carregando RSAC…</div>;

  if (isMobile) {
    const mobileTab = tab === "dashboard" ? "cases" : tab;
    const wsCase = activeCaseId ? cases.find((c) => c.id === activeCaseId) : null;
    const hasTodayAlertByTab = {
      cases: cases.some((c) => c.status === "Ativo" && caseDeadlineInfo(c, tasks).status === "today"),
      tasks: tasks.some((t) => !t.done && t.dueDate === todayISO()),
    };
    const floatingAddAction = {
      cases: () => { setEditingCase(null); setModal("case"); },
      tasks: () => { setEditingTask(null); setFolderCaseId(null); setModal("task"); },
      calendar: () => { setEditingTask(null); setFolderCaseId(null); setModal("task"); },
    }[mobileTab];

    return (
      <div style={{ minHeight: "100vh", background: CONTENT_BG, fontFamily: "Arial, sans-serif" }}>
        {wsCase ? (
          <MobileCaseScreen item={wsCase} client={clients.find((c) => c.id === wsCase.clientId)} clients={clients}
            events={events} tasks={tasks} notes={notes} documents={documents} finance={finance}
            onBack={() => setActiveCaseId(null)}
            onEdit={() => { setEditingCase(wsCase); setModal("case"); }}
            onOpenClient={(c) => { setActiveCaseId(null); setTab("clients"); setViewClient(c); }}
            onOpenJudge={(j) => { setActiveCaseId(null); setTab("clients"); setViewClient(j); }}
            onAddEvent={() => { setFolderCaseId(wsCase.id); setModal("event"); }}
            onDeleteEvent={(id) => removeRow("events", id)}
            onToggleTask={toggleTask}
            onDeleteTask={(id) => removeRow("tasks", id)}
            onAddTask={() => { setFolderCaseId(wsCase.id); setModal("task"); }}
            onEditTask={(t) => { setEditingTask(t); setModal("task"); }}
            onAddNote={() => { setFolderCaseId(wsCase.id); setModal("note"); }}
            onDeleteNote={(id) => removeRow("notes", id)}
            onAddDoc={() => { setFolderCaseId(wsCase.id); setModal("document"); }}
            onDeleteDoc={(id) => removeRow("documents", id)}
            onAddExpense={() => { setFinanceContext({ caseId: wsCase.id, clientId: wsCase.clientId, presetType: "Despesa" }); setModal("finance"); }}
            onAddPayment={() => { setFinanceContext({ caseId: wsCase.id, clientId: wsCase.clientId, presetType: "Receita" }); setModal("finance"); }}
            onDeleteFinance={(id) => removeRow("finance", id)}
            caseTypes={caseTypesByCaseId[wsCase.id] || []} caseTypesCatalog={caseTypesCatalog}
            onAddCaseType={(name) => handleAddCaseType(wsCase.id, name)}
            onRemoveCaseType={(typeId) => handleRemoveCaseType(wsCase.id, typeId)}
            onEditNoteContent={handleEditNoteContent} onTogglePinNote={handleTogglePinNote}
            onCreateTaskFromNote={handleCreateTaskFromNote}
            onAddNoteRich={(values) => handleAddNote(wsCase.id, values)} />
        ) : (
          <>
            {mobileTab === "cases" && (
              <MobileCasosScreen cases={cases} tasks={tasks} search={search} onSearchChange={setSearch} onOpenCase={openCase} />
            )}
            {mobileTab === "tasks" && (
              <MobileTasksScreen tasks={tasks} cases={cases} onToggle={toggleTask} onDelete={(id) => removeRow("tasks", id)}
                onEdit={(t) => { setEditingTask(t); setModal("task"); }} onOpenCase={openCase} />
            )}
            {mobileTab === "calendar" && (
              <div style={{ padding: "16px 18px 100px" }}>
                <AgendaTab tasks={tasks}
                  onDeleteTask={(id) => removeRow("tasks", id)}
                  onAddTask={() => { setEditingTask(null); setFolderCaseId(null); setModal("task"); }}
                  onTokenAcquired={setGoogleToken}
                  onSyncAll={syncAllTasks} />
              </div>
            )}
            {mobileTab === "finance" && (
              <div style={{ padding: "16px 18px 100px" }}>
                <FinanceTab finance={finance} clients={clients} cases={cases}
                  onAdd={() => { setEditingFinance(null); setFinanceContext(null); setModal("finance"); }}
                  onEdit={(f) => { setEditingFinance(f); setModal("finance"); }}
                  onDelete={(id) => removeRow("finance", id)} clientName={clientName}
                  onOpenCase={(id) => { setActiveCaseId(id); }} />
              </div>
            )}
            {mobileTab === "clients" && (
              <div style={{ padding: "16px 18px 100px" }}>
                {viewClient ? (
                  <ClientFolder client={viewClient} cases={cases} finance={finance} precedents={precedents}
                    onBack={() => setViewClient(null)}
                    onEdit={() => { setEditingClient(viewClient); setModal("client"); }}
                    onDelete={() => removeClientAndClose(viewClient.id)}
                    onOpenCase={(c) => { setViewClient(null); openCase(c.id); }}
                    onToggleOptIn={() => toggleOptIn(viewClient)}
                    onAddPrecedent={() => { setFolderCaseId(viewClient.id); setModal("precedent"); }}
                    onDeletePrecedent={(id) => removeRow("precedents", id)} />
                ) : (
                  <>
                    <div style={{ fontFamily: "Georgia, serif", fontSize: 24, color: SIDEBAR_NAVY, marginBottom: 12 }}>Contatos</div>
                    <SearchBar value={search} onChange={setSearch} placeholder="Buscar contato…" />
                    {sortByName(clients.filter((c) => !search.trim() || [c.name, c.email, c.phone].filter(Boolean).some((f) => f.toLowerCase().includes(search.trim().toLowerCase())))).map((c) => (
                      <RowCard key={c.id} onClick={() => setViewClient(c)} title={c.name} subtitle={c.contactType || "Cliente"} />
                    ))}
                  </>
                )}
              </div>
            )}
            {mobileTab === "intake" && (
              <div style={{ padding: "16px 18px 100px" }}>
                <IntakeReviewTab onUseSubmission={useSubmission} />
              </div>
            )}

            {mobileTab === "newsletter" && role === "admin" && (
              <div style={{ padding: "16px 18px 100px" }}>
                <NewsletterTab clients={clients} newsletters={newsletters} onSave={saveNewsletter} onDelete={deleteNewsletter} />
              </div>
            )}
            <MobileBottomNav active={["clients", "finance", "newsletter", "intake"].includes(mobileTab) ? "more" : mobileTab}
              onNavigate={(id) => { if (id === "more") setMobileMoreOpen(true); else goToTab(id); }}
              onAdd={floatingAddAction || (() => {})}
              hasTodayAlertByTab={hasTodayAlertByTab} />
            {mobileMoreOpen && (
              <MobileMoreSheet role={role} userEmail={session.user?.email}
                onNavigate={(id) => { setTab(id); setMobileMoreOpen(false); }}
                onClose={() => setMobileMoreOpen(false)}
                onSignOut={() => supabase.auth.signOut()} />
            )}
          </>
        )}

        {modal && (
          <FormLayer modal={modal} onClose={() => { setModal(null); setEditingClient(null); setPrefillClient(null); setEditingCase(null); setEditingTask(null); setEditingFinance(null); setFolderCaseId(null); setFinanceContext(null); setTaskPrefill(null); }} clients={clients} cases={cases} prefill={prefillClient}
            editing={modal === "client" ? editingClient : modal === "case" ? editingCase : modal === "task" ? editingTask : modal === "finance" ? editingFinance : null}
            taskCaseId={folderCaseId}
            taskPrefill={taskPrefill}
            financeContext={financeContext}
            onAddClient={(v) => { addRow("clients", v); setModal(null); setPrefillClient(null); }}
            onEditClient={(id, v) => { editClientRow(id, v); setModal(null); setEditingClient(null); }}
            onAddCase={(v) => { addRow("cases", v); setModal(null); }}
            onEditCase={(id, v) => { editCaseRow(id, v); setModal(null); setEditingCase(null); }}
            onAddTask={(v) => { addTaskWithSync(v); setModal(null); setFolderCaseId(null); setTaskPrefill(null); }}
            onEditTask={(id, v) => { editTaskRow(id, v); setModal(null); setEditingTask(null); }}
            onAddTaskRecurring={(v, every, unit, times) => { addTaskRecurring(v, every, unit, times); setModal(null); setFolderCaseId(null); }}
            onAddFinance={(v) => { addRow("finance", v); setModal(null); setFinanceContext(null); }}
            onEditFinance={(id, v) => { editFinanceRow(id, v); setModal(null); setEditingFinance(null); }}
            onAddFinanceRecurring={(v, months) => { addFinanceRecurring(v, months); setModal(null); setFinanceContext(null); }}
            onAddEvent={(v) => { addRow("events", v); setModal(null); setFolderCaseId(null); }}
            onAddNote={(v) => { addRow("notes", v); setModal(null); setFolderCaseId(null); }}
            onAddDoc={(v) => { addRow("documents", v); setModal(null); setFolderCaseId(null); }}
            onAddPrecedent={(v) => { addRow("precedents", v); setModal(null); setFolderCaseId(null); }}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: 560, background: CREAM, fontFamily: "Arial, sans-serif", borderRadius: 10, overflow: "hidden", border: "1px solid #EAE7DC" }}>
      <div style={{ width: 268, background: SIDEBAR_NAVY, padding: "26px 16px 20px", display: "flex", flexDirection: "column", gap: 22, flexShrink: 0 }}>
        <div style={{ textAlign: "center", padding: "0 8px 16px", borderBottom: "1px solid rgba(232,226,213,0.16)" }}>
          <Logo dark />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {NAV.map((n) => {
            const active = !activeCaseId && tab === n.id;
            const hovered = hoveredNavId === n.id && !active;
            const Icon = n.icon;
            return (
              <button key={n.id} onClick={() => goToTab(n.id)}
                onMouseEnter={() => setHoveredNavId(n.id)} onMouseLeave={() => setHoveredNavId(null)}
                style={{
                display: "flex", alignItems: "center", gap: 12, padding: active ? "10px 12px 10px 9px" : "10px 12px",
                borderRadius: 6, fontSize: 15, background: active ? NAV_ACTIVE_BG : hovered ? NAV_HOVER_BG : "transparent",
                borderLeft: active ? `3px solid ${GOLD_ACCENT}` : "none", border: "none",
                color: active || hovered ? "#f5efe4" : NAV_TEXT_SECONDARY, fontWeight: active ? 600 : 400,
                cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "background 120ms ease, color 120ms ease",
              }}>
                <Icon size={17} color={active ? GOLD_ACCENT : "rgba(240,234,221,0.7)"} />
                {n.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minHeight: 0, overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 12px 6px" }}>
            <span style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: 600, color: "rgba(240,234,221,0.45)" }}>CASOS ATIVOS</span>
            <button onClick={() => { setEditingCase(null); setModal("case"); }} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(240,234,221,0.5)", fontSize: 15, padding: 0 }}>+</button>
          </div>
          {activeCasesList.length === 0 && (
            <div style={{ padding: "6px 12px", fontSize: 12, color: "rgba(240,234,221,0.4)" }}>Nenhum caso ativo.</div>
          )}
          {activeCasesList.map((c) => {
            const active = activeCaseId === c.id;
            const hovered = hoveredCaseItemId === c.id && !active;
            const statusColorOnNavy = c.deadline.status === "overdue" || c.deadline.status === "today" ? ALERT_ON_NAVY
              : c.deadline.status === "upcoming" ? GOLD_ACCENT : "rgba(240,234,221,0.45)";
            return (
              <div key={c.id} onClick={() => openCase(c.id)} title={c.title}
                onMouseEnter={() => setHoveredCaseItemId(c.id)} onMouseLeave={() => setHoveredCaseItemId(null)}
                style={{
                padding: "10px 12px", borderRadius: 6, cursor: "pointer",
                background: active ? NAV_ACTIVE_BG : hovered ? NAV_HOVER_BG : "transparent",
                borderLeft: active ? `3px solid ${GOLD_ACCENT}` : "3px solid transparent",
                transition: "background 120ms ease",
              }}>
                <div style={{
                  fontSize: 14, lineHeight: 1.35, color: active ? "#f5efe4" : "rgba(240,234,221,0.8)", fontWeight: active ? 600 : 400,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                }}>{c.title}</div>
                <div style={{ fontSize: 11, marginTop: 4, color: statusColorOnNavy }}>{c.deadline.label}</div>
              </div>
            );
          })}
          <button onClick={() => goToTab("cases")} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(240,234,221,0.5)", fontSize: 12, textAlign: "left", padding: "8px 12px 0" }}>Ver todos os casos →</button>
        </div>

        <div style={{ paddingTop: 18, borderTop: "1px solid rgba(232,226,213,0.16)" }}>
          {showMoreNav && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 10 }}>
              {SECONDARY_NAV.map((n) => (
                <button key={n.id} onClick={() => { goToTab(n.id); setShowMoreNav(false); }} style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", color: "rgba(240,234,221,0.7)", fontSize: 13, cursor: "pointer", padding: "6px 4px", textAlign: "left", fontFamily: "inherit" }}>
                  <n.icon size={14} /> {n.label}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setShowMoreNav((v) => !v)} style={{ background: "none", border: "none", color: "rgba(240,234,221,0.5)", fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 10 }}>
            {showMoreNav ? "Menos opções ▲" : "Mais opções ▾"}
          </button>
          <div style={{ fontSize: 12, color: "rgba(240,234,221,0.5)", marginBottom: 10 }}>{session.user?.email}</div>
          <button onClick={() => supabase.auth.signOut()} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: "rgba(240,234,221,0.7)", fontSize: 12.5, cursor: "pointer", padding: 0 }}>
            <LogOut size={14} /> Sair
          </button>
        </div>
      </div>

      <div style={{ flex: 1, padding: "28px 32px", overflowY: "auto", background: CONTENT_BG }}>
        {activeCaseId ? (
          (() => {
            const wsCase = cases.find((c) => c.id === activeCaseId);
            if (!wsCase) return <Empty text="Caso não encontrado." />;
            return (
              <CaseWorkspace item={wsCase} client={clients.find((c) => c.id === wsCase.clientId)} clients={clients}
                events={events} tasks={tasks} notes={notes} documents={documents} precedents={precedents} finance={finance}
                onEdit={() => { setEditingCase(wsCase); setModal("case"); }}
                onDelete={() => { removeRow("cases", wsCase.id); setActiveCaseId(null); }}
                onOpenClient={(c) => { setActiveCaseId(null); setTab("clients"); setViewClient(c); }}
                onOpenJudge={(j) => { setActiveCaseId(null); setTab("clients"); setViewClient(j); }}
                onAddEvent={() => { setFolderCaseId(wsCase.id); setModal("event"); }}
                onDeleteEvent={(id) => removeRow("events", id)}
                onToggleTask={toggleTask}
                onDeleteTask={(id) => removeRow("tasks", id)}
                onAddTask={() => { setFolderCaseId(wsCase.id); setModal("task"); }}
                onEditTask={(t) => { setEditingTask(t); setModal("task"); }}
                onAddNote={() => { setFolderCaseId(wsCase.id); setModal("note"); }}
                onDeleteNote={(id) => removeRow("notes", id)}
                onAddDoc={() => { setFolderCaseId(wsCase.id); setModal("document"); }}
                onDeleteDoc={(id) => removeRow("documents", id)}
                onAddExpense={() => { setFinanceContext({ caseId: wsCase.id, clientId: wsCase.clientId, presetType: "Despesa" }); setModal("finance"); }}
                onAddPayment={() => { setFinanceContext({ caseId: wsCase.id, clientId: wsCase.clientId, presetType: "Receita" }); setModal("finance"); }}
                onDeleteFinance={(id) => removeRow("finance", id)}
                caseTypes={caseTypesByCaseId[wsCase.id] || []} caseTypesCatalog={caseTypesCatalog}
                onAddCaseType={(name) => handleAddCaseType(wsCase.id, name)}
                onRemoveCaseType={(typeId) => handleRemoveCaseType(wsCase.id, typeId)}
                onEditNoteContent={handleEditNoteContent} onTogglePinNote={handleTogglePinNote}
                onCreateTaskFromNote={handleCreateTaskFromNote}
                onAddNoteRich={(values) => handleAddNote(wsCase.id, values)} />
            );
          })()
        ) : (
        <>
        {tab === "dashboard" && (
          <>
            <h1 style={{ fontFamily: "Georgia, serif", color: NAVY, fontSize: 24, margin: "0 0 4px" }}>Painel</h1>
            <p style={{ color: MUTED, fontSize: 13.5, margin: "0 0 20px" }}>Visão geral do escritório.</p>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
              <StatCard icon={Users} label="Contatos" value={clients.length} />
              <StatCard icon={Briefcase} label="Casos ativos" value={activeCases} />
              <StatCard icon={CheckSquare} label="Tarefas em aberto" value={openTasks} />
              <StatCard icon={CalendarIcon} label="Compromissos" value={tasks.filter((t) => t.time).length} />
            </div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <div style={{ flex: "2 1 320px", background: "#fff", border: "1px solid #EAE7DC", borderRadius: 10, padding: 20 }}>
                <h3 style={{ fontFamily: "Georgia, serif", fontSize: 15, color: NAVY, margin: "0 0 14px" }}>Casos recentes</h3>
                {recentCases.length === 0 && <p style={{ fontSize: 13, color: MUTED }}>Nenhum caso cadastrado ainda.</p>}
                {recentCases.map((c) => (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #F1EFE8" }}>
                    <div>
                      <div style={{ fontSize: 14, color: INK, fontWeight: 500 }}>{c.title}</div>
                      <div style={{ fontSize: 12, color: MUTED }}>{clientName(c.clientId)} {c.number ? `· ${c.number}` : ""}</div>
                    </div>
                    <Badge text={c.status} />
                  </div>
                ))}
              </div>
              <div style={{ flex: "1 1 260px", background: "#fff", border: "1px solid #EAE7DC", borderRadius: 10, padding: 20 }}>
                <h3 style={{ fontFamily: "Georgia, serif", fontSize: 15, color: NAVY, margin: "0 0 14px" }}>Próximos compromissos</h3>
                {upcomingAppts.length === 0 && <p style={{ fontSize: 13, color: MUTED }}>Nenhum compromisso futuro.</p>}
                {upcomingAppts.map((a) => (
                  <div key={a.id} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: "1px solid #F1EFE8" }}>
                    <div style={{ background: NAVY, color: "#EDE6D8", borderRadius: 6, padding: "4px 8px", fontSize: 10, textAlign: "center", minWidth: 40 }}>{fmtDate(a.date).split(" de ")[0]}</div>
                    <div>
                      <div style={{ fontSize: 13.5, color: INK }}>{a.title}</div>
                      <div style={{ fontSize: 11.5, color: MUTED }}>{a.time || ""} {a.location ? `· ${a.location}` : ""}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "clients" && (
          viewClient ? (
            <ClientFolder client={viewClient} cases={cases} finance={finance} precedents={precedents}
              onBack={() => setViewClient(null)}
              onEdit={() => { setEditingClient(viewClient); setModal("client"); }}
              onDelete={() => removeClientAndClose(viewClient.id)}
              onOpenCase={(c) => openCase(c.id)}
              onToggleOptIn={() => toggleOptIn(viewClient)}
              onAddPrecedent={() => { setFolderCaseId(viewClient.id); setModal("precedent"); }}
              onDeletePrecedent={(id) => removeRow("precedents", id)} />
          ) : (
            <ListPage title="Contatos" subtitle="Clientes, colaboradores, partes contrárias e juízes do escritório." onAdd={() => { setEditingClient(null); setModal("client"); }}>
              <SearchBar value={search} onChange={setSearch} placeholder="Buscar contato (em todos os grupos)…" />
              {(() => {
                const q = search.trim().toLowerCase();
                const filtered = sortByName(clients.filter((c) => {
                  if (!q) return true;
                  return [c.name, c.email, c.phone, c.cpfCnpj, c.address, c.contactType]
                    .filter(Boolean)
                    .some((field) => field.toLowerCase().includes(q));
                }));
                const groups = ["Cliente", "Colaborador", "Parte contrária", "Juiz"];
                const groupLabels = { "Cliente": "Clientes", "Colaborador": "Colaboradores", "Parte contrária": "Partes contrárias", "Juiz": "Juízes" };

                const renderRow = (c) => {
                  const doc = c.cpfCnpj ? `${c.type === "PJ" ? "CNPJ" : "CPF"} ${c.cpfCnpj}` : null;
                  const rg = c.type === "PF" && c.rg ? `RG ${c.rg}` : null;
                  const subtitle = [c.type === "PJ" ? "Pessoa jurídica" : "Pessoa física", doc, rg, c.email || null, c.phone || null].filter(Boolean).join(" · ");
                  return (
                    <RowCard key={c.id}
                      onClick={() => setViewClient(c)}
                      onEdit={() => { setEditingClient(c); setModal("client"); }}
                      onDelete={() => removeRow("clients", c.id)}
                      title={c.name} subtitle={subtitle} />
                  );
                };

                // Buscando: mostra resultado universal, ignorando grupos
                if (q) {
                  if (filtered.length === 0) return <Empty text="Nenhum contato encontrado." />;
                  return filtered.map(renderRow);
                }

                // Sem busca, dentro de um grupo: mostra a lista daquele grupo
                if (contactGroup) {
                  const items = sortByName(clients.filter((c) => (c.contactType || "Cliente") === contactGroup));
                  return (
                    <>
                      <button onClick={() => setContactGroup(null)} style={{ background: "none", border: "none", color: MUTED, fontSize: 12.5, cursor: "pointer", padding: 0, marginBottom: 12 }}>← Voltar aos grupos</button>
                      <div style={{ fontSize: 10.5, color: "#9A917E", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{groupLabels[contactGroup]} ({items.length})</div>
                      {items.length === 0 && <Empty text="Nenhum contato neste grupo ainda." />}
                      {items.map(renderRow)}
                    </>
                  );
                }

                // Sem busca, sem grupo selecionado: mostra os grupos
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {groups.map((g) => {
                      const count = clients.filter((c) => (c.contactType || "Cliente") === g).length;
                      return (
                        <div key={g} onClick={() => setContactGroup(g)} style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          background: "#fff", border: "1px solid #EAE7DC", borderRadius: 10, padding: "16px 18px", cursor: "pointer",
                        }}>
                          <span style={{ fontFamily: "Georgia, serif", fontSize: 15, color: NAVY }}>{groupLabels[g]}</span>
                          <span style={{ fontSize: 12.5, color: MUTED }}>{count} →</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              {clients.length === 0 && <Empty text="Nenhum contato cadastrado. Adicione o primeiro." />}
            </ListPage>
          )
        )}

        {tab === "cases" && (
          <ListPage title="Casos" subtitle="Processos e casos em andamento, agrupados por cliente." onAdd={() => { setEditingCase(null); setModal("case"); }}>
              {(() => {
                const byClient = {};
                cases.forEach((c) => { (byClient[c.clientId || "sem-cliente"] = byClient[c.clientId || "sem-cliente"] || []).push(c); });
                const clientIds = Object.keys(byClient);
                if (clientIds.length === 0) return <Empty text="Nenhum caso cadastrado. Adicione o primeiro." />;
                return clientIds.map((cid) => {
                  const items = byClient[cid];
                  const label = cid === "sem-cliente" ? "Sem cliente vinculado" : clientName(cid);
                  const expanded = expandedCaseClient === cid;
                  return (
                    <div key={cid} style={{ marginBottom: 8 }}>
                      <div onClick={() => setExpandedCaseClient(expanded ? null : cid)} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        background: "#fff", border: "1px solid #EAE7DC", borderRadius: 8, padding: "12px 14px", cursor: "pointer",
                      }}>
                        <span style={{ fontSize: 14, color: INK, fontWeight: 500 }}>{label}</span>
                        <span style={{ fontSize: 12, color: MUTED }}>{items.length} caso(s) {expanded ? "▲" : "▼"}</span>
                      </div>
                      {expanded && (
                        <div style={{ paddingLeft: 14, marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                          {items.map((c) => (
                            <RowCard key={c.id}
                              onClick={() => openCase(c.id)}
                              onEdit={() => { setEditingCase(c); setModal("case"); }}
                              onDelete={() => removeRow("cases", c.id)}
                              title={c.title} subtitle={`${c.number || "sem número"}${c.area ? " · " + c.area : ""}`} right={<Badge text={c.status} />} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
          </ListPage>
        )}

        {tab === "tasks" && (
          <ListPage title="Tarefas" subtitle="Pendências do escritório, agrupadas por caso." onAdd={() => { setEditingTask(null); setFolderCaseId(null); setModal("task"); }}>
            {(() => {
              const todayStr = todayISO();
              const today = new Date(todayStr + "T00:00:00");
              const weekStart = new Date(today);
              weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
              const dayLabels = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
              const weekDays = Array.from({ length: 7 }, (_, i) => {
                const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
                return d.toISOString().slice(0, 10);
              });
              const tasksByDay = {};
              tasks.forEach((t) => { if (t.dueDate) (tasksByDay[t.dueDate] = tasksByDay[t.dueDate] || []).push(t); });

              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 18 }}>
                  {weekDays.map((iso, i) => {
                    const isToday = iso === todayStr;
                    const isSelected = taskDayFilter === iso;
                    const hasItems = !!tasksByDay[iso];
                    const dateNum = Number(iso.slice(8, 10));
                    return (
                      <div key={iso} onClick={() => setTaskDayFilter(isSelected ? null : iso)} style={{
                        textAlign: "center", padding: "8px 2px", borderRadius: 6, cursor: "pointer",
                        background: isSelected ? GOLD : isToday ? NAVY : "#fff",
                        border: isSelected || isToday ? "none" : "1px solid #E3E0D6",
                      }}>
                        <div style={{ fontSize: 9, color: isSelected ? "#12283f" : isToday ? "#B9C2CC" : "#9A917E" }}>{dayLabels[i]}</div>
                        <div style={{ fontSize: 14, margin: "2px 0", color: isSelected ? "#12283f" : isToday ? "#EDE6D8" : INK }}>{dateNum}</div>
                        {hasItems && <div style={{ width: 4, height: 4, borderRadius: "50%", margin: "0 auto", background: isSelected || isToday ? "#fff" : GOLD }} />}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {taskDayFilter && (
              <button onClick={() => setTaskDayFilter(null)} style={{ background: "none", border: "none", color: NAVY, fontSize: 12.5, cursor: "pointer", padding: 0, marginBottom: 12 }}>← Ver todas as tarefas</button>
            )}
            {(() => {
              const visibleTasks = taskDayFilter ? tasks.filter((t) => t.dueDate === taskDayFilter) : tasks;
              const byCase = {};
              const noCase = [];
              visibleTasks.forEach((t) => {
                if (t.caseId) { (byCase[t.caseId] = byCase[t.caseId] || []).push(t); }
                else noCase.push(t);
              });
              const caseGroups = Object.keys(byCase).map((cid) => ({
                caseItem: cases.find((c) => c.id === cid),
                items: byCase[cid],
              })).filter((g) => g.caseItem);
              if (caseGroups.length === 0 && noCase.length === 0) {
                return <Empty text={taskDayFilter ? "Nenhuma tarefa para este dia." : "Nenhuma tarefa cadastrada. Adicione a primeira."} />;
              }
              return (
                <>
                  {caseGroups.map((g) => (
                    <div key={g.caseItem.id} style={{ marginBottom: 16 }}>
                      <div onClick={() => openCase(g.caseItem.id)} style={{ fontSize: 10.5, color: "#9A917E", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, cursor: "pointer" }}>{g.caseItem.title} →</div>
                      <div style={{ background: "#fff", border: "1px solid #EAE7DC", borderRadius: 8, padding: "4px 12px" }}>
                        {g.items.map((t) => (
                          <TaskRow key={t.id} t={t} onToggle={toggleTask} onDelete={(id) => removeRow("tasks", id)}
                            onEdit={(task) => { setEditingTask(task); setFolderCaseId(task.caseId); setModal("task"); }} showDueInfo />
                        ))}
                      </div>
                    </div>
                  ))}
                  {noCase.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 10.5, color: "#9A917E", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Sem caso vinculado</div>
                      <div style={{ background: "#fff", border: "1px solid #EAE7DC", borderRadius: 8, padding: "4px 12px" }}>
                        {noCase.map((t) => (
                          <TaskRow key={t.id} t={t} onToggle={toggleTask} onDelete={(id) => removeRow("tasks", id)}
                            onEdit={(task) => { setEditingTask(task); setFolderCaseId(null); setModal("task"); }} showDueInfo />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </ListPage>
        )}

        {tab === "calendar" && (
          <AgendaTab tasks={tasks}
            onDeleteTask={(id) => removeRow("tasks", id)}
            onAddTask={() => { setEditingTask(null); setFolderCaseId(null); setModal("task"); }}
            onTokenAcquired={setGoogleToken}
            onSyncAll={syncAllTasks} />
        )}

        {tab === "finance" && (
          <FinanceTab finance={finance} clients={clients} cases={cases}
            onAdd={() => { setEditingFinance(null); setFinanceContext(null); setModal("finance"); }}
            onEdit={(f) => { setEditingFinance(f); setModal("finance"); }}
            onDelete={(id) => removeRow("finance", id)}
            clientName={clientName} onOpenCase={(id) => openCase(id)} />
        )}

        {tab === "intake" && (
          <IntakeReviewTab onUseSubmission={useSubmission} />
        )}

        {tab === "newsletter" && role === "admin" && (
          <NewsletterTab clients={clients} newsletters={newsletters} onSave={saveNewsletter} onDelete={deleteNewsletter} />
        )}
        </>
        )}
      </div>

      {modal && (
        <FormLayer modal={modal} onClose={() => { setModal(null); setEditingClient(null); setPrefillClient(null); setEditingCase(null); setEditingTask(null); setEditingFinance(null); setFolderCaseId(null); setFinanceContext(null); setTaskPrefill(null); }} clients={clients} cases={cases} prefill={prefillClient}
          editing={modal === "client" ? editingClient : modal === "case" ? editingCase : modal === "task" ? editingTask : modal === "finance" ? editingFinance : null}
          taskCaseId={folderCaseId}
          taskPrefill={taskPrefill}
          financeContext={financeContext}
          onAddClient={(v) => { addRow("clients", v); setModal(null); setPrefillClient(null); }}
          onEditClient={(id, v) => { editClientRow(id, v); setModal(null); setEditingClient(null); }}
          onAddCase={(v) => { addRow("cases", v); setModal(null); }}
          onEditCase={(id, v) => { editCaseRow(id, v); setModal(null); setEditingCase(null); }}
          onAddTask={(v) => { addTaskWithSync(v); setModal(null); setFolderCaseId(null); setTaskPrefill(null); }}
          onAddTaskRecurring={(v, every, unit, times) => { addTaskRecurring(v, every, unit, times); setModal(null); setFolderCaseId(null); }}
          onEditTask={(id, v) => { editTaskRow(id, v); setModal(null); setEditingTask(null); }}
          onAddFinance={(v) => { addRow("finance", v); setModal(null); setFinanceContext(null); }}
          onEditFinance={(id, v) => { editFinanceRow(id, v); setModal(null); setEditingFinance(null); }}
          onAddFinanceRecurring={(v, months) => { addFinanceRecurring(v, months); setModal(null); setFinanceContext(null); }}
          onAddEvent={(v) => { addRow("events", v); setModal(null); setFolderCaseId(null); }}
          onAddNote={(v) => { addRow("notes", v); setModal(null); setFolderCaseId(null); }}
          onAddDoc={(v) => { addRow("documents", v); setModal(null); setFolderCaseId(null); }}
          onAddPrecedent={(v) => { addRow("precedents", v); setModal(null); setFolderCaseId(null); }}
        />
      )}
    </div>
  );
}
