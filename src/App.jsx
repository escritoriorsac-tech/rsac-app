import React, { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard, Users, Briefcase, CheckSquare, Calendar as CalendarIcon,
  Wallet, Plus, X, Trash2, Search, LogOut, Pencil, Mail
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

async function pushEventToGoogle(accessToken, appt) {
  try {
    await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: appt.title,
        location: appt.location || undefined,
        start: appt.time ? { dateTime: `${appt.date}T${appt.time}:00` } : { date: appt.date },
        end: appt.time ? { dateTime: `${appt.date}T${appt.time}:00` } : { date: appt.date },
      }),
    });
  } catch (e) { console.error("Falha ao enviar evento ao Google Agenda", e); }
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
};
const fmtBRL = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_COLORS = {
  "Ativo": { bg: "#EAF3DE", text: "#27500A" },
  "Suspenso": { bg: "#FAEEDA", text: "#633806" },
  "Encerrado": { bg: "#F1EFE8", text: "#444441" },
};

// camelCase (JS) <-> snake_case (Postgres)
const toClient = (r) => ({ id: r.id, name: r.name, type: r.type, email: r.email, phone: r.phone, cpfCnpj: r.cpf_cnpj, rg: r.rg, newsletterOptIn: r.newsletter_opt_in, contactType: r.contact_type || "Cliente", address: r.address, accessCode: r.access_code });
const toCase = (r) => ({ id: r.id, title: r.title, clientId: r.client_id, number: r.number, area: r.area, status: r.status, caseType: r.case_type || "Judicial", tribunal: r.tribunal, comarca: r.comarca, instancia: r.instancia, vara: r.vara, tribunalLink: r.tribunal_link, judgeId: r.judge_id, balcaoVirtualLink: r.balcao_virtual_link });
const toTask = (r) => ({ id: r.id, title: r.title, dueDate: r.due_date, done: r.done, caseId: r.case_id, notes: r.notes, completedAt: r.completed_at, isStallAlert: r.is_stall_alert, alertType: r.alert_type, financeId: r.finance_id });
const toAppt = (r) => ({ id: r.id, title: r.title, date: r.date, time: r.time, location: r.location });
const toFinance = (r) => ({ id: r.id, description: r.description, amount: r.amount, type: r.type, date: r.date, clientId: r.client_id, caseId: r.case_id, bankAccount: r.bank_account, paid: r.paid !== false, recurrenceGroup: r.recurrence_group });
const toEvent = (r) => ({ id: r.id, caseId: r.case_id, date: r.event_date, description: r.description, notes: r.notes });
const toNote = (r) => ({ id: r.id, caseId: r.case_id, date: r.note_date, content: r.content });
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
  if (key === "clients") return { name: row.name, type: row.type, email: row.email, phone: row.phone, cpf_cnpj: row.cpfCnpj || null, rg: row.rg || null, newsletter_opt_in: row.newsletterOptIn !== undefined ? row.newsletterOptIn : true, contact_type: row.contactType || "Cliente", address: row.address || null };
  if (key === "cases") return { title: row.title, client_id: row.clientId || null, number: row.number, area: row.area, status: row.status, case_type: row.caseType || "Judicial", tribunal: row.tribunal || null, comarca: row.comarca || null, instancia: row.instancia || null, vara: row.vara || null, tribunal_link: row.tribunalLink || null, judge_id: row.judgeId || null, balcao_virtual_link: row.balcaoVirtualLink || null };
  if (key === "tasks") return { title: row.title, due_date: row.dueDate || null, done: row.done || false, case_id: row.caseId || null, notes: row.notes || null, completed_at: row.completedAt || null };
  if (key === "appts") return { title: row.title, date: row.date, time: row.time, location: row.location };
  if (key === "finance") return { description: row.description, amount: row.amount, type: row.type, date: row.date, client_id: row.clientId || null, case_id: row.caseId || null, bank_account: row.bankAccount || null, paid: row.paid !== undefined ? row.paid : true, recurrence_group: row.recurrenceGroup || null };
  if (key === "events") return { case_id: row.caseId, event_date: row.date, description: row.description, notes: row.notes || null };
  if (key === "notes") return { case_id: row.caseId, note_date: row.date || todayISO(), content: row.content };
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

function Logo({ dark = true, size = "normal" }) {
  const big = size === "big";
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: big ? 34 : 22, letterSpacing: big ? 8 : 5, color: dark ? "#EDE6D8" : NAVY }}>RSAC</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, margin: big ? "10px 0 8px" : "6px 0 4px" }}>
        <div style={{ width: big ? 60 : 36, height: 1, background: GOLD }} />
        <div style={{ width: 4, height: 4, borderRadius: 4, background: GOLD }} />
        <div style={{ width: big ? 60 : 36, height: 1, background: GOLD }} />
      </div>
      <div style={{ fontFamily: "Georgia, serif", fontSize: big ? 10 : 7.5, letterSpacing: 2, color: dark ? "#9A917E" : MUTED }}>
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

function Empty({ text }) {
  return <p style={{ fontSize: 13.5, color: MUTED, background: "#fff", border: "1px dashed #DDD8C9", borderRadius: 8, padding: 20, textAlign: "center" }}>{text}</p>;
}

function SubmitRow({ onClose, onSubmit }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
      <button onClick={onClose} style={{ background: "none", border: "1px solid #E3E0D6", borderRadius: 6, padding: "9px 16px", fontSize: 13, cursor: "pointer", color: MUTED }}>Cancelar</button>
      <button onClick={onSubmit} style={{ background: NAVY, color: "#EDE6D8", border: "none", borderRadius: 6, padding: "9px 16px", fontSize: 13, cursor: "pointer" }}>Salvar</button>
    </div>
  );
}

function FormLayer({ modal, onClose, clients, cases, editing, taskCaseId, financeContext, onAddClient, onEditClient, onAddCase, onEditCase, onAddTask, onEditTask, onAddAppt, onAddFinance, onEditFinance, onAddFinanceRecurring, onAddEvent, onAddNote, onAddDoc, onAddPrecedent }) {
  const [error, setError] = useState("");

  if (modal === "client") {
    const [name, setName] = useState(editing?.name || ""); const [type, setType] = useState(editing?.type || "PF");
    const [email, setEmail] = useState(editing?.email || ""); const [phone, setPhone] = useState(editing?.phone || "");
    const [cpfCnpj, setCpfCnpj] = useState(editing?.cpfCnpj || ""); const [rg, setRg] = useState(editing?.rg || "");
    const [contactType, setContactType] = useState(editing?.contactType || "Cliente");
    const [address, setAddress] = useState(editing?.address || "");
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
        {type === "PF" && (
          <Field label="RG"><input style={inputStyle} value={rg} onChange={(e) => setRg(e.target.value)} placeholder="00.000.000-0" /></Field>
        )}
        <Field label="E-mail"><input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@exemplo.com" /></Field>
        <Field label="Telefone"><input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 90000-0000" /></Field>
        <Field label="Endereço"><input style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua, número, bairro, cidade – UF" /></Field>
        {error && <div style={{ color: "#993D1D", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <SubmitRow onClose={onClose} onSubmit={() => {
          if (!name.trim()) { setError("Informe o nome do cliente."); return; }
          const values = { name: name.trim(), type, email, phone, cpfCnpj, rg: type === "PF" ? rg : "", contactType, address };
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
    const [judgeId, setJudgeId] = useState(editing?.judgeId || "");
    const judges = clients.filter((c) => c.contactType === "Juiz");
    return (
      <Modal title={editing ? "Editar caso" : "Novo caso"} onClose={onClose}>
        <Field label="Título do caso"><input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Planejamento sucessório" /></Field>
        <Field label="Cliente"><select style={inputStyle} value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">Selecionar…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
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
          </>
        )}
        <Field label="Número do processo (opcional)"><input style={inputStyle} value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
        <Field label="Área"><input style={inputStyle} value={area} onChange={(e) => setArea(e.target.value)} placeholder="Tributário, empresarial…" /></Field>
        <Field label="Status"><select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}><option>Ativo</option><option>Suspenso</option><option>Encerrado</option></select></Field>
        {error && <div style={{ color: "#993D1D", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <SubmitRow onClose={onClose} onSubmit={() => {
          if (!title.trim()) { setError("Informe o título do caso."); return; }
          const values = { title: title.trim(), clientId, number, area, status, caseType, tribunal, comarca, instancia, vara, tribunalLink, judgeId, balcaoVirtualLink };
          if (editing) onEditCase(editing.id, values); else onAddCase(values);
        }} />
      </Modal>
    );
  }

  if (modal === "task") {
    const [title, setTitle] = useState(editing?.title || ""); const [dueDate, setDueDate] = useState(editing?.dueDate || "");
    const [notes, setNotes] = useState(editing?.notes || "");
    const [caseId, setCaseId] = useState(editing?.caseId || taskCaseId || "");
    return (
      <Modal title={editing ? "Editar tarefa" : taskCaseId ? "Nova tarefa do caso" : "Nova tarefa"} onClose={onClose}>
        <Field label="Descrição"><input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Protocolar manifestação" /></Field>
        <Field label="Prazo (opcional)"><input type="date" style={inputStyle} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        {editing && (
          <Field label="Caso vinculado (opcional)">
            <select style={inputStyle} value={caseId} onChange={(e) => setCaseId(e.target.value)}>
              <option value="">— Sem caso vinculado —</option>
              {cases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </Field>
        )}
        <Field label="Solução (opcional)"><textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "inherit" }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="O que foi feito para resolver…" /></Field>
        {error && <div style={{ color: "#993D1D", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <SubmitRow onClose={onClose} onSubmit={() => {
          if (!title.trim()) { setError("Descreva a tarefa."); return; }
          const values = { title: title.trim(), dueDate, notes, caseId: editing ? (caseId || null) : (taskCaseId || null) };
          if (editing) onEditTask(editing.id, values); else onAddTask(values);
        }} />
      </Modal>
    );
  }

  if (modal === "appt") {
    const [title, setTitle] = useState(""); const [date, setDate] = useState(todayISO());
    const [time, setTime] = useState(""); const [location, setLocation] = useState("");
    return (
      <Modal title="Novo compromisso" onClose={onClose}>
        <Field label="Título"><input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Reunião com cliente" /></Field>
        <Field label="Data"><input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Hora (opcional)"><input type="time" style={inputStyle} value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        <Field label="Local (opcional)"><input style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
        {error && <div style={{ color: "#993D1D", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <SubmitRow onClose={onClose} onSubmit={() => { if (!title.trim() || !date) { setError("Informe título e data."); return; } onAddAppt({ title: title.trim(), date, time, location }); }} />
      </Modal>
    );
  }

  if (modal === "finance") {
    const [description, setDescription] = useState(editing?.description || ""); const [amount, setAmount] = useState(editing?.amount || "");
    const [type, setType] = useState(editing?.type || financeContext?.presetType || "Receita"); const [date, setDate] = useState(editing?.date || todayISO());
    const [clientId, setClientId] = useState(editing?.clientId || financeContext?.clientId || "");
    const [bankAccount, setBankAccount] = useState(editing?.bankAccount || "");
    const [paid, setPaid] = useState(editing ? editing.paid !== false : true);
    const [recurrent, setRecurrent] = useState(false);
    const [months, setMonths] = useState(2);
    return (
      <Modal title={editing ? "Editar lançamento" : financeContext?.presetType === "Despesa" ? "Nova despesa processual" : financeContext?.presetType === "Receita" ? "Novo pagamento do cliente" : "Novo lançamento"} onClose={onClose}>
        <Field label="Descrição"><input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Honorário — caso X" /></Field>
        <Field label="Tipo"><select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}><option>Receita</option><option>Despesa</option></select></Field>
        <Field label="Valor (R$)"><input type="number" step="0.01" style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></Field>
        <Field label="Data"><input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Conta bancária (opcional)"><input style={inputStyle} value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="Ex: Banco do Brasil — CC 12345-6" /></Field>
        <Field label="Cliente (opcional)"><select style={inputStyle} value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">—</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 13, color: INK }}>
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} style={{ width: 15, height: 15, accentColor: GOLD }} />
          {type === "Despesa" ? "Já foi pago" : "Já foi recebido"}
        </label>
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
          const base = { description: description.trim(), amount: Number(amount), type, date, clientId, bankAccount, paid, caseId: financeContext?.caseId || (editing ? editing.caseId : null) };
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
    </>
  );
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

function TaskRow({ t, onToggle, onDelete, onEdit, showDueInfo }) {
  const d = daysUntil(t.dueDate);
  const overdue = d !== null && d < 0 && !t.done;
  const status = taskStatus(t);
  return (
    <div style={{ padding: "8px 0", borderBottom: "1px solid #F1EFE8" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input type="checkbox" checked={t.done} onChange={() => onToggle(t.id)} style={{ width: 15, height: 15, accentColor: GOLD, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, textDecoration: t.done ? "line-through" : "none", color: t.done ? MUTED : INK }}>
            {t.title}
            {t.isStallAlert && <span style={{ fontSize: 9.5, background: "#FBE3DC", color: "#993D1D", padding: "1px 7px", borderRadius: 10, marginLeft: 8 }}>Automático</span>}
          </div>
          {showDueInfo && t.dueDate && (
            <div style={{ fontSize: 11, color: overdue ? "#993D1D" : MUTED }}>
              {t.done ? `concluída · ${fmtDate(t.dueDate)}` : overdue ? `vencido há ${Math.abs(d)} dia(s)` : d === 0 ? "vence hoje" : `vence em ${d} dia(s)`}
            </div>
          )}
        </div>
        {status && (
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 12, flexShrink: 0,
            background: status === "No prazo" ? "#EAF3DE" : "#FBE3DC",
            color: status === "No prazo" ? "#27500A" : "#993D1D",
          }}>{status}</span>
        )}
        {onEdit && <button onClick={() => onEdit(t)} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }}><Pencil size={13} /></button>}
        <button onClick={() => onDelete(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C0997B" }}><Trash2 size={14} /></button>
      </div>
      {t.notes && (
        <div style={{ background: "#F1EFE8", borderRadius: 6, padding: "7px 9px", fontSize: 11, color: MUTED, marginTop: 6, marginLeft: 25 }}>
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

function caseDeadlineInfo(caseItem, tasks) {
  const openTasks = tasks.filter((t) => t.caseId === caseItem.id && !t.done);
  if (openTasks.length === 0) return { openTaskCount: 0, status: "none", label: "sem pendências" };
  const withDue = openTasks.filter((t) => t.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (withDue.length === 0) return { openTaskCount: openTasks.length, status: "upcoming", label: `${openTasks.length} tarefa(s)` };
  const next = withDue[0];
  const d = daysUntil(next.dueDate);
  let status = "upcoming";
  if (d < 0) status = "overdue";
  else if (d === 0) status = "today";
  const label = status === "overdue" ? `prazo vencido há ${Math.abs(d)}d`
    : status === "today" ? "1 prazo hoje"
    : `${openTasks.length} tarefa(s) · prazo em ${d}d`;
  return { openTaskCount: openTasks.length, status, label };
}

function CaseWorkspace({
  item, client, clients, events, tasks, notes, documents, precedents, finance,
  onEdit, onDelete, onOpenClient, onOpenJudge,
  onAddEvent, onDeleteEvent, onToggleTask, onDeleteTask, onAddTask, onEditTask,
  onAddNote, onDeleteNote, onAddDoc, onDeleteDoc, onAddExpense, onAddPayment, onDeleteFinance,
}) {
  const [wsTab, setWsTab] = useState("tarefas");
  const judge = clients.find((c) => c.id === item.judgeId);
  const caseEvents = events.filter((e) => e.caseId === item.id).sort((a, b) => a.date.localeCompare(b.date));
  const caseTasks = tasks.filter((t) => t.caseId === item.id);
  const openTaskCount = caseTasks.filter((t) => !t.done).length;
  const caseNotes = notes.filter((n) => n.caseId === item.id);
  const caseDocs = documents.filter((d) => d.caseId === item.id);
  const caseFinance = (finance || []).filter((f) => f.caseId === item.id);
  const caseExpenses = caseFinance.filter((f) => f.type === "Despesa");
  const casePayments = caseFinance.filter((f) => f.type === "Receita");

  const TABS = [
    { id: "tarefas", label: "Tarefas", count: openTaskCount },
    { id: "prazos", label: "Prazos", count: caseEvents.length },
    { id: "documentos", label: "Documentos", count: caseDocs.length + caseNotes.length },
    { id: "financeiro", label: "Financeiro", count: caseFinance.length },
    { id: "contatos", label: "Contatos", count: 0 },
  ];

  const addLabel = {
    tarefas: "+ Nova tarefa", prazos: "+ Adicionar evento", documentos: "+ Adicionar documento",
    financeiro: "+ Adicionar lançamento", contatos: null,
  }[wsTab];
  const addAction = {
    tarefas: onAddTask, prazos: onAddEvent, documentos: onAddDoc, financeiro: onAddExpense, contatos: null,
  }[wsTab];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.5, fontWeight: 600, color: GOLD_DARK, marginBottom: 6, textTransform: "uppercase" }}>
            CASO · {item.caseType === "Judicial" ? "PROCESSO JUDICIAL" : "CONSULTORIA"}
          </div>
          <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 600, fontSize: 30, lineHeight: 1.15, color: NAVY, margin: 0 }}>{item.title}</h1>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 8 }}>
            {[item.number, item.vara].filter(Boolean).join(" · ") || "sem dados processuais"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={onEdit} style={{ background: "#fff", border: "1px solid #E3E0D6", color: NAVY, fontSize: 13, fontWeight: 600, padding: "10px 14px", borderRadius: 6, cursor: "pointer" }}>Editar</button>
          {addAction && (
            <button onClick={addAction} style={{ background: NAVY, color: "#f5efe4", border: "none", fontSize: 14, fontWeight: 600, padding: "11px 18px", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap" }}>{addLabel}</button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 26, borderBottom: `1px solid ${DIVIDER}`, marginBottom: 20 }}>
        {TABS.map((t) => {
          const active = wsTab === t.id;
          return (
            <button key={t.id} onClick={() => setWsTab(t.id)} style={{
              background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
              fontSize: 14, fontWeight: active ? 600 : 400, color: active ? NAVY : "#6b6455",
              padding: "0 0 11px", borderBottom: active ? `2px solid ${GOLD_ACCENT}` : "2px solid transparent",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              {t.label}
              {t.count > 0 && <span style={{ fontSize: 12, color: "#857d6c" }}>{t.count}</span>}
            </button>
          );
        })}
      </div>

      {wsTab === "tarefas" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {caseTasks.length === 0 && <p style={{ fontSize: 15, color: "#857d6c", textAlign: "center", padding: "30px 0" }}>Nenhuma tarefa neste caso.</p>}
          {caseTasks.map((t) => (
            <div key={t.id} style={{ background: "#fff", border: `1px solid ${CARD_BORDER}`, borderRadius: 8, padding: "14px 18px", opacity: t.done ? 0.72 : 1 }}>
              <TaskRow t={t} onToggle={onToggleTask} onDelete={onDeleteTask} onEdit={onEditTask} showDueInfo />
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
          <SectionCard title="Anotações">
            {caseNotes.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhuma anotação registrada.</p>}
            {caseNotes.map((n) => (
              <div key={n.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid #F1EFE8" }}>
                <div><div style={{ fontSize: 11, color: "#9A917E" }}>{fmtDate(n.date)}</div><div style={{ fontSize: 13, color: INK }}>{n.content}</div></div>
                <button onClick={() => onDeleteNote(n.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C0997B" }}><Trash2 size={14} /></button>
              </div>
            ))}
            <button onClick={onAddNote} style={{ background: "none", border: "none", color: NAVY, fontSize: 12.5, cursor: "pointer", padding: 0, marginTop: 10 }}>+ Adicionar anotação</button>
          </SectionCard>
        </>
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

function AgendaTab({ appts, tasks, onDeleteAppt, onDeleteTask, onAddAppt }) {
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [viewMonth, setViewMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEvents, setGoogleEvents] = useState([]);
  const [googleBusy, setGoogleBusy] = useState(false);
  const tokenRef = React.useRef(null);
  const tokenClientRef = React.useRef(null);

  const apptItems = appts.map((a) => ({ kind: "Compromisso", date: a.date, id: a.id, title: a.title, extra: a.time || "", location: a.location, done: false }));
  const taskItems = tasks.filter((t) => t.dueDate).map((t) => ({ kind: "Tarefa", date: t.dueDate, id: t.id, title: t.title, extra: "", location: "", done: t.done }));
  const googleItems = googleEvents.map((g) => ({ kind: "Google", date: g.date, id: g.id, title: g.title, extra: g.time || "", location: "", done: false }));
  const allItems = [...apptItems, ...taskItems, ...googleItems];
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
          <AddButton onClick={onAddAppt} />
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
            onDelete={it.kind === "Google" ? undefined : () => (it.kind === "Tarefa" ? onDeleteTask(it.id) : onDeleteAppt(it.id))}
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
function MonthlyChart({ finance, monthlyGoal }) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("pt-BR", { month: "short" }) };
  });
  const byMonth = months.map((m) => {
    const items = finance.filter((f) => f.date && f.date.startsWith(m.key));
    const receita = items.filter((f) => f.type === "Receita").reduce((s, f) => s + Number(f.amount || 0), 0);
    const despesa = items.filter((f) => f.type === "Despesa").reduce((s, f) => s + Number(f.amount || 0), 0);
    return { ...m, receita, despesa, saldo: receita - despesa };
  });
  const maxVal = Math.max(monthlyGoal, ...byMonth.map((m) => Math.max(m.saldo, 0)), 1);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 160, padding: "10px 6px 0" }}>
      {byMonth.map((m) => {
        const h = Math.max(4, Math.round((Math.max(m.saldo, 0) / maxVal) * 130));
        const hitGoal = m.saldo >= monthlyGoal && monthlyGoal > 0;
        return (
          <div key={m.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 10, color: MUTED, marginBottom: 4 }}>{fmtBRL(m.saldo)}</div>
            <div style={{
              width: "100%", maxWidth: 36, height: h, borderRadius: "4px 4px 0 0",
              background: m.saldo < 0 ? "#C0997B" : hitGoal ? "#27500A" : GOLD,
            }} />
            <div style={{ fontSize: 10.5, color: MUTED, marginTop: 6, textTransform: "capitalize" }}>{m.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function FinanceTab({
  finance, clients, monthlyGoal, onSaveGoal, onAdd, onEdit, onDelete, clientName,
}) {
  const [goalInput, setGoalInput] = useState(monthlyGoal || "");
  const receitas = finance.filter((f) => f.type === "Receita").reduce((s, f) => s + Number(f.amount || 0), 0);
  const despesas = finance.filter((f) => f.type === "Despesa").reduce((s, f) => s + Number(f.amount || 0), 0);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: "Georgia, serif", color: NAVY, fontSize: 24, margin: "0 0 4px" }}>Financeiro</h1>
          <p style={{ color: MUTED, fontSize: 13.5, margin: 0 }}>Honorários e despesas do escritório.</p>
        </div>
        <AddButton onClick={onAdd} />
      </div>
      <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard icon={Wallet} label="Receitas" value={fmtBRL(receitas)} />
        <StatCard icon={Wallet} label="Despesas" value={fmtBRL(despesas)} />
        <StatCard icon={Wallet} label="Saldo" value={fmtBRL(receitas - despesas)} />
      </div>

      <SectionCard title="Desempenho mensal">
        <MonthlyChart finance={finance} monthlyGoal={Number(monthlyGoal) || 0} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, paddingTop: 14, borderTop: "1px solid #F1EFE8" }}>
          <span style={{ fontSize: 12.5, color: MUTED }}>Meta mensal (saldo)</span>
          <input type="number" step="100" style={{ ...inputStyle, maxWidth: 160 }} value={goalInput} onChange={(e) => setGoalInput(e.target.value)} placeholder="Ex: 50000" />
          <button onClick={() => onSaveGoal(Number(goalInput) || 0)} style={{ background: NAVY, color: "#EDE6D8", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 12.5, cursor: "pointer" }}>Salvar meta</button>
        </div>
      </SectionCard>

      {finance.slice().reverse().map((f) => (
        <RowCard key={f.id} onEdit={() => onEdit(f)} onDelete={() => onDelete(f.id)} title={f.description}
          subtitle={`${fmtDate(f.date)}${f.clientId ? " · " + clientName(f.clientId) : ""}${f.bankAccount ? " · " + f.bankAccount : ""}${!f.paid ? (f.type === "Despesa" ? " · a pagar" : " · a receber") : ""}`}
          right={<span style={{ color: f.type === "Receita" ? "#27500A" : "#993D1D", fontSize: 14, fontWeight: 500 }}>{f.type === "Receita" ? "+" : "-"}{fmtBRL(f.amount)}</span>} />
      ))}
      {finance.length === 0 && <Empty text="Nenhum lançamento cadastrado." />}
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
  const [editingCase, setEditingCase] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [editingFinance, setEditingFinance] = useState(null);
  const [viewClient, setViewClient] = useState(null);
  const [contactGroup, setContactGroup] = useState(null);
  const [activeCaseId, setActiveCaseId] = useState(null);
  const [showMoreNav, setShowMoreNav] = useState(false);
  const [expandedCaseClient, setExpandedCaseClient] = useState(null);
  const [viewCase, setViewCase] = useState(null);
  const [role, setRole] = useState(null);
  const [newsletters, setNewsletters] = useState([]);
  const [portalData, setPortalData] = useState(null);

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
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
      const r = profile?.role || "staff";
      setRole(r);
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

  const openTasks = tasks.filter((t) => !t.done).length;
  const activeCases = cases.filter((c) => c.status === "Ativo").length;
  const upcomingAppts = [...appts].filter((a) => a.date >= todayISO()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
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
    ...(role === "admin" ? [{ id: "newsletter", label: "Newsletter", icon: Mail }] : []),
  ];
  const activeCasesList = cases
    .filter((c) => c.status === "Ativo")
    .map((c) => ({ ...c, deadline: caseDeadlineInfo(c, tasks) }))
    .sort((a, b) => {
      const order = { overdue: 0, today: 1, upcoming: 2, none: 3 };
      return order[a.deadline.status] - order[b.deadline.status];
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

  if (portalData) {
    return <ClientPortalView data={portalData} onExit={() => setPortalData(null)} />;
  }

  if (session === undefined) {
    return <div style={{ padding: 40, textAlign: "center", color: MUTED, fontFamily: "Georgia, serif" }}>Carregando…</div>;
  }
  if (!session) return <LoginScreen onClientPortalAccess={setPortalData} />;
  if (loading) return <div style={{ padding: 40, textAlign: "center", color: MUTED, fontFamily: "Georgia, serif" }}>Carregando RSAC…</div>;

  return (
    <div style={{ display: "flex", minHeight: 560, background: CREAM, fontFamily: "Arial, sans-serif", borderRadius: 10, overflow: "hidden", border: "1px solid #EAE7DC" }}>
      <div style={{ width: 268, background: SIDEBAR_NAVY, padding: "26px 16px 20px", display: "flex", flexDirection: "column", gap: 22, flexShrink: 0 }}>
        <div style={{ textAlign: "center", padding: "0 8px 16px", borderBottom: "1px solid rgba(232,226,213,0.16)" }}>
          <Logo dark />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {NAV.map((n) => {
            const active = !activeCaseId && tab === n.id;
            const Icon = n.icon;
            return (
              <button key={n.id} onClick={() => goToTab(n.id)} style={{
                display: "flex", alignItems: "center", gap: 12, padding: active ? "10px 12px 10px 9px" : "10px 12px",
                borderRadius: 6, fontSize: 15, background: active ? "rgba(240,234,221,0.10)" : "transparent",
                borderLeft: active ? `3px solid ${GOLD_ACCENT}` : "none", border: "none",
                color: active ? "#f5efe4" : "rgba(240,234,221,0.82)", fontWeight: active ? 600 : 400,
                cursor: "pointer", textAlign: "left", fontFamily: "inherit",
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
            const statusColorOnNavy = c.deadline.status === "overdue" || c.deadline.status === "today" ? ALERT_ON_NAVY
              : c.deadline.status === "upcoming" ? GOLD_ACCENT : "rgba(240,234,221,0.45)";
            return (
              <div key={c.id} onClick={() => openCase(c.id)} title={c.title} style={{
                padding: "10px 12px", borderRadius: 6, cursor: "pointer",
                background: active ? "rgba(240,234,221,0.10)" : "transparent",
                borderLeft: active ? `3px solid ${GOLD_ACCENT}` : "3px solid transparent",
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

      <div style={{ flex: 1, padding: "28px 32px", overflowY: "auto" }}>
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
                onDeleteFinance={(id) => removeRow("finance", id)} />
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
              <StatCard icon={CalendarIcon} label="Compromissos" value={appts.length} />
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
                const filtered = clients.filter((c) => {
                  if (!q) return true;
                  return [c.name, c.email, c.phone, c.cpfCnpj, c.address, c.contactType]
                    .filter(Boolean)
                    .some((field) => field.toLowerCase().includes(q));
                });
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
                  const items = clients.filter((c) => (c.contactType || "Cliente") === contactGroup);
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
              const byCase = {};
              const noCase = [];
              tasks.forEach((t) => {
                if (t.caseId) { (byCase[t.caseId] = byCase[t.caseId] || []).push(t); }
                else noCase.push(t);
              });
              const caseGroups = Object.keys(byCase).map((cid) => ({
                caseItem: cases.find((c) => c.id === cid),
                items: byCase[cid],
              })).filter((g) => g.caseItem);
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
            {tasks.length === 0 && <Empty text="Nenhuma tarefa cadastrada. Adicione a primeira." />}
          </ListPage>
        )}

        {tab === "calendar" && (
          <AgendaTab appts={appts} tasks={tasks}
            onDeleteAppt={(id) => removeRow("appts", id)}
            onDeleteTask={(id) => removeRow("tasks", id)}
            onAddAppt={() => setModal("appt")} />
        )}

        {tab === "finance" && (
          <FinanceTab finance={finance} clients={clients} monthlyGoal={monthlyGoal} onSaveGoal={saveMonthlyGoal}
            onAdd={() => { setEditingFinance(null); setFinanceContext(null); setModal("finance"); }}
            onEdit={(f) => { setEditingFinance(f); setModal("finance"); }}
            onDelete={(id) => removeRow("finance", id)}
            clientName={clientName} />
        )}

        {tab === "newsletter" && role === "admin" && (
          <NewsletterTab clients={clients} newsletters={newsletters} onSave={saveNewsletter} onDelete={deleteNewsletter} />
        )}
        </>
        )}
      </div>

      {modal && (
        <FormLayer modal={modal} onClose={() => { setModal(null); setEditingClient(null); setEditingCase(null); setEditingTask(null); setEditingFinance(null); setFolderCaseId(null); setFinanceContext(null); }} clients={clients} cases={cases}
          editing={modal === "client" ? editingClient : modal === "case" ? editingCase : modal === "task" ? editingTask : modal === "finance" ? editingFinance : null}
          taskCaseId={folderCaseId}
          financeContext={financeContext}
          onAddClient={(v) => { addRow("clients", v); setModal(null); }}
          onEditClient={(id, v) => { editClientRow(id, v); setModal(null); setEditingClient(null); }}
          onAddCase={(v) => { addRow("cases", v); setModal(null); }}
          onEditCase={(id, v) => { editCaseRow(id, v); setModal(null); setEditingCase(null); }}
          onAddTask={(v) => { addRow("tasks", v); setModal(null); setFolderCaseId(null); }}
          onEditTask={(id, v) => { editTaskRow(id, v); setModal(null); setEditingTask(null); }}
          onAddAppt={(v) => { addRow("appts", v); setModal(null); }}
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
