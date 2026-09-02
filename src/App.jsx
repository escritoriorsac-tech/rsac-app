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
const toClient = (r) => ({ id: r.id, name: r.name, type: r.type, email: r.email, phone: r.phone, cpfCnpj: r.cpf_cnpj, rg: r.rg, newsletterOptIn: r.newsletter_opt_in, contactType: r.contact_type || "Cliente", address: r.address });
const toCase = (r) => ({ id: r.id, title: r.title, clientId: r.client_id, number: r.number, area: r.area, status: r.status, caseType: r.case_type || "Judicial", tribunal: r.tribunal, comarca: r.comarca, instancia: r.instancia, vara: r.vara, tribunalLink: r.tribunal_link, judgeId: r.judge_id });
const toTask = (r) => ({ id: r.id, title: r.title, dueDate: r.due_date, done: r.done, caseId: r.case_id, notes: r.notes, completedAt: r.completed_at });
const toAppt = (r) => ({ id: r.id, title: r.title, date: r.date, time: r.time, location: r.location });
const toFinance = (r) => ({ id: r.id, description: r.description, amount: r.amount, type: r.type, date: r.date, clientId: r.client_id });
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
  const [c, cs, t, a, f, ev, no, doc, pr] = await Promise.all([
    supabase.from("clients").select("*").order("created_at"),
    supabase.from("cases").select("*").order("created_at"),
    supabase.from("tasks").select("*").order("created_at"),
    supabase.from("appointments").select("*").order("date"),
    supabase.from("finance_entries").select("*").order("date"),
    supabase.from("case_events").select("*").order("event_date"),
    supabase.from("case_notes").select("*").order("note_date", { ascending: false }),
    supabase.from("case_documents").select("*").order("created_at"),
    supabase.from("judge_precedents").select("*").order("created_at"),
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
  };
}

function toPayload(key, row) {
  if (key === "clients") return { name: row.name, type: row.type, email: row.email, phone: row.phone, cpf_cnpj: row.cpfCnpj || null, rg: row.rg || null, newsletter_opt_in: row.newsletterOptIn !== undefined ? row.newsletterOptIn : true, contact_type: row.contactType || "Cliente", address: row.address || null };
  if (key === "cases") return { title: row.title, client_id: row.clientId || null, number: row.number, area: row.area, status: row.status, case_type: row.caseType || "Judicial", tribunal: row.tribunal || null, comarca: row.comarca || null, instancia: row.instancia || null, vara: row.vara || null, tribunal_link: row.tribunalLink || null, judge_id: row.judgeId || null };
  if (key === "tasks") return { title: row.title, due_date: row.dueDate || null, done: row.done || false, case_id: row.caseId || null, notes: row.notes || null, completed_at: row.completedAt || null };
  if (key === "appts") return { title: row.title, date: row.date, time: row.time, location: row.location };
  if (key === "finance") return { description: row.description, amount: row.amount, type: row.type, date: row.date, client_id: row.clientId || null };
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

function FormLayer({ modal, onClose, clients, editing, taskCaseId, onAddClient, onEditClient, onAddCase, onEditCase, onAddTask, onEditTask, onAddAppt, onAddFinance, onAddEvent, onAddNote, onAddDoc, onAddPrecedent }) {
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
          </>
        )}
        <Field label="Número do processo (opcional)"><input style={inputStyle} value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
        <Field label="Área"><input style={inputStyle} value={area} onChange={(e) => setArea(e.target.value)} placeholder="Tributário, empresarial…" /></Field>
        <Field label="Status"><select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}><option>Ativo</option><option>Suspenso</option><option>Encerrado</option></select></Field>
        {error && <div style={{ color: "#993D1D", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <SubmitRow onClose={onClose} onSubmit={() => {
          if (!title.trim()) { setError("Informe o título do caso."); return; }
          const values = { title: title.trim(), clientId, number, area, status, caseType, tribunal, comarca, instancia, vara, tribunalLink, judgeId };
          if (editing) onEditCase(editing.id, values); else onAddCase(values);
        }} />
      </Modal>
    );
  }

  if (modal === "task") {
    const [title, setTitle] = useState(editing?.title || ""); const [dueDate, setDueDate] = useState(editing?.dueDate || "");
    const [notes, setNotes] = useState(editing?.notes || "");
    return (
      <Modal title={editing ? "Editar tarefa" : taskCaseId ? "Nova tarefa do caso" : "Nova tarefa"} onClose={onClose}>
        <Field label="Descrição"><input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Protocolar manifestação" /></Field>
        <Field label="Prazo (opcional)"><input type="date" style={inputStyle} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        <Field label="Solução (opcional)"><textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "inherit" }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="O que foi feito para resolver…" /></Field>
        {error && <div style={{ color: "#993D1D", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <SubmitRow onClose={onClose} onSubmit={() => {
          if (!title.trim()) { setError("Descreva a tarefa."); return; }
          const values = { title: title.trim(), dueDate, notes, caseId: editing ? editing.caseId : (taskCaseId || null) };
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
    const [description, setDescription] = useState(""); const [amount, setAmount] = useState("");
    const [type, setType] = useState("Receita"); const [date, setDate] = useState(todayISO());
    const [clientId, setClientId] = useState("");
    return (
      <Modal title="Novo lançamento" onClose={onClose}>
        <Field label="Descrição"><input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Honorário — caso X" /></Field>
        <Field label="Tipo"><select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}><option>Receita</option><option>Despesa</option></select></Field>
        <Field label="Valor (R$)"><input type="number" step="0.01" style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></Field>
        <Field label="Data"><input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Cliente (opcional)"><select style={inputStyle} value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">—</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        {error && <div style={{ color: "#993D1D", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <SubmitRow onClose={onClose} onSubmit={() => { if (!description.trim() || !amount) { setError("Informe descrição e valor."); return; } onAddFinance({ description: description.trim(), amount: Number(amount), type, date, clientId }); }} />
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

function LoginScreen() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [info, setInfo] = useState(""); const [busy, setBusy] = useState(false);

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

  return (
    <div style={{ minHeight: 560, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, padding: 24 }}>
      <div style={{ background: CREAM, borderRadius: 10, padding: "32px 30px", width: "100%", maxWidth: 360, boxSizing: "border-box" }}>
        <div style={{ marginBottom: 26 }}><Logo dark={false} /></div>
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
          <div style={{ fontSize: 13, textDecoration: t.done ? "line-through" : "none", color: t.done ? MUTED : INK }}>{t.title}</div>
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
function CaseFolder({
  item, client, clients, events, tasks, notes, documents, precedents,
  onBack, onEdit, onDelete, onOpenClient, onOpenJudge,
  onAddEvent, onDeleteEvent, onToggleTask, onDeleteTask, onAddTask, onEditTask,
  onAddNote, onDeleteNote, onAddDoc, onDeleteDoc,
}) {
  const judge = clients.find((c) => c.id === item.judgeId);
  const caseEvents = events.filter((e) => e.caseId === item.id).sort((a, b) => a.date.localeCompare(b.date));
  const caseTasks = tasks.filter((t) => t.caseId === item.id);
  const caseNotes = notes.filter((n) => n.caseId === item.id);
  const caseDocs = documents.filter((d) => d.caseId === item.id);
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
function NewsletterTab({ clients, newsletters, onSave, onDelete }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [scheduledFor, setScheduledFor] = useState(todayISO());
  const [error, setError] = useState("");
  const optedInCount = clients.filter((c) => c.newsletterOptIn !== false && c.email).length;

  const submit = () => {
    if (!subject.trim() || !body.trim() || !scheduledFor) { setError("Preencha assunto, conteúdo e data de envio."); return; }
    setError("");
    onSave({ subject: subject.trim(), htmlBody: body.trim(), scheduledFor });
    setSubject(""); setBody("");
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
        <Field label="Data de envio"><input type="date" style={inputStyle} value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} /></Field>
        {error && <div style={{ color: "#993D1D", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={submit} style={{ background: NAVY, color: "#EDE6D8", border: "none", borderRadius: 6, padding: "9px 16px", fontSize: 13, cursor: "pointer" }}>Agendar envio</button>
        </div>
      </SectionCard>

      <SectionCard title={`Edições (${newsletters.length})`}>
        {newsletters.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nenhuma newsletter agendada ainda.</p>}
        {newsletters.map((n) => (
          <RowCard key={n.id} title={n.subject} subtitle={`Envio em ${fmtDate(n.scheduled_for)}${n.sent ? " · enviada" : " · agendada"}`}
            right={<Badge text={n.sent ? "Encerrado" : "Ativo"} />}
            onDelete={n.sent ? undefined : () => onDelete(n.id)} />
        ))}
      </SectionCard>
    </>
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
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [folderCaseId, setFolderCaseId] = useState(null);
  const [editingClient, setEditingClient] = useState(null);
  const [editingCase, setEditingCase] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [viewClient, setViewClient] = useState(null);
  const [contactGroup, setContactGroup] = useState(null);
  const [viewCase, setViewCase] = useState(null);
  const [role, setRole] = useState(null);
  const [newsletters, setNewsletters] = useState([]);

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

  const removeClientAndClose = (id) => { removeRow("clients", id); setViewClient(null); };
  const removeCaseAndClose = (id) => { removeRow("cases", id); setViewCase(null); };

  const goToTab = (id) => { setTab(id); setViewClient(null); setViewCase(null); setContactGroup(null); setSearch(""); };

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
    { id: "clients", label: "Contatos", icon: Users },
    { id: "cases", label: "Casos", icon: Briefcase },
    { id: "tasks", label: "Tarefas", icon: CheckSquare },
    { id: "calendar", label: "Agenda", icon: CalendarIcon },
    { id: "finance", label: "Financeiro", icon: Wallet },
    ...(role === "admin" ? [{ id: "newsletter", label: "Newsletter", icon: Mail }] : []),
  ];

  const saveNewsletter = async (values) => {
    const { data, error } = await supabase.from("newsletters").insert([{
      subject: values.subject, html_body: values.htmlBody, scheduled_for: values.scheduledFor,
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

  if (session === undefined) {
    return <div style={{ padding: 40, textAlign: "center", color: MUTED, fontFamily: "Georgia, serif" }}>Carregando…</div>;
  }
  if (!session) return <LoginScreen />;
  if (loading) return <div style={{ padding: 40, textAlign: "center", color: MUTED, fontFamily: "Georgia, serif" }}>Carregando RSAC…</div>;

  return (
    <div style={{ display: "flex", minHeight: 560, background: CREAM, fontFamily: "Arial, sans-serif", borderRadius: 10, overflow: "hidden", border: "1px solid #EAE7DC" }}>
      <div style={{ width: 210, background: NAVY, padding: "28px 0", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "0 16px 22px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 18 }}>
          <Logo dark />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 10px" }}>
          {NAV.map((n) => {
            const active = tab === n.id;
            const Icon = n.icon;
            return (
              <button key={n.id} onClick={() => goToTab(n.id)} style={{ display: "flex", alignItems: "center", gap: 10, background: active ? "rgba(176,141,87,0.16)" : "transparent", border: "none", borderLeft: active ? `2px solid ${GOLD}` : "2px solid transparent", color: active ? "#EDE6D8" : "#B9C2CC", padding: "10px 12px", fontSize: 13.5, cursor: "pointer", textAlign: "left", borderRadius: 4, fontFamily: "inherit" }}>
                <Icon size={16} color={active ? GOLD : "#B9C2CC"} />
                {n.label}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: "auto", padding: "16px" }}>
          <div style={{ fontSize: 10.5, color: "#7C8794", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12, marginBottom: 10 }}>
            {session.user?.email}
          </div>
          <button onClick={() => supabase.auth.signOut()} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: "#B9C2CC", fontSize: 12.5, cursor: "pointer", padding: 0 }}>
            <LogOut size={14} /> Sair
          </button>
        </div>
      </div>

      <div style={{ flex: 1, padding: "28px 32px", overflowY: "auto" }}>
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
              onOpenCase={(c) => { setViewClient(null); setTab("cases"); setViewCase(c); }}
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
          viewCase ? (
            <CaseFolder item={viewCase} client={clients.find((c) => c.id === viewCase.clientId)} clients={clients}
              events={events} tasks={tasks} notes={notes} documents={documents} precedents={precedents}
              onBack={() => setViewCase(null)}
              onEdit={() => { setEditingCase(viewCase); setModal("case"); }}
              onDelete={() => removeCaseAndClose(viewCase.id)}
              onOpenClient={(c) => { setViewCase(null); setTab("clients"); setViewClient(c); }}
              onOpenJudge={(j) => { setViewCase(null); setTab("clients"); setViewClient(j); }}
              onAddEvent={() => { setFolderCaseId(viewCase.id); setModal("event"); }}
              onDeleteEvent={(id) => removeRow("events", id)}
              onToggleTask={toggleTask}
              onDeleteTask={(id) => removeRow("tasks", id)}
              onAddTask={() => { setFolderCaseId(viewCase.id); setModal("task"); }}
              onEditTask={(t) => { setEditingTask(t); setModal("task"); }}
              onAddNote={() => { setFolderCaseId(viewCase.id); setModal("note"); }}
              onDeleteNote={(id) => removeRow("notes", id)}
              onAddDoc={() => { setFolderCaseId(viewCase.id); setModal("document"); }}
              onDeleteDoc={(id) => removeRow("documents", id)} />
          ) : (
            <ListPage title="Casos" subtitle="Processos e casos em andamento." onAdd={() => { setEditingCase(null); setModal("case"); }}>
              {cases.map((c) => (
                <RowCard key={c.id}
                  onClick={() => setViewCase(c)}
                  onEdit={() => { setEditingCase(c); setModal("case"); }}
                  onDelete={() => removeRow("cases", c.id)}
                  title={c.title} subtitle={`${clientName(c.clientId)}${c.number ? " · " + c.number : ""}${c.area ? " · " + c.area : ""}`} right={<Badge text={c.status} />} />
              ))}
              {cases.length === 0 && <Empty text="Nenhum caso cadastrado. Adicione o primeiro." />}
            </ListPage>
          )
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
                      <div style={{ fontSize: 10.5, color: "#9A917E", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{g.caseItem.title}</div>
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
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
              <div>
                <h1 style={{ fontFamily: "Georgia, serif", color: NAVY, fontSize: 24, margin: "0 0 4px" }}>Financeiro</h1>
                <p style={{ color: MUTED, fontSize: 13.5, margin: 0 }}>Honorários e despesas do escritório.</p>
              </div>
              <AddButton onClick={() => setModal("finance")} />
            </div>
            <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
              <StatCard icon={Wallet} label="Receitas" value={fmtBRL(receitas)} />
              <StatCard icon={Wallet} label="Despesas" value={fmtBRL(despesas)} />
              <StatCard icon={Wallet} label="Saldo" value={fmtBRL(receitas - despesas)} />
            </div>
            {finance.slice().reverse().map((f) => (
              <RowCard key={f.id} onDelete={() => removeRow("finance", f.id)} title={f.description} subtitle={`${fmtDate(f.date)}${f.clientId ? " · " + clientName(f.clientId) : ""}`}
                right={<span style={{ color: f.type === "Receita" ? "#27500A" : "#993D1D", fontSize: 14, fontWeight: 500 }}>{f.type === "Receita" ? "+" : "-"}{fmtBRL(f.amount)}</span>} />
            ))}
            {finance.length === 0 && <Empty text="Nenhum lançamento cadastrado." />}
          </>
        )}

        {tab === "newsletter" && role === "admin" && (
          <NewsletterTab clients={clients} newsletters={newsletters} onSave={saveNewsletter} onDelete={deleteNewsletter} />
        )}
      </div>

      {modal && (
        <FormLayer modal={modal} onClose={() => { setModal(null); setEditingClient(null); setEditingCase(null); setEditingTask(null); setFolderCaseId(null); }} clients={clients}
          editing={modal === "client" ? editingClient : modal === "case" ? editingCase : modal === "task" ? editingTask : null}
          taskCaseId={folderCaseId}
          onAddClient={(v) => { addRow("clients", v); setModal(null); }}
          onEditClient={(id, v) => { editClientRow(id, v); setModal(null); setEditingClient(null); }}
          onAddCase={(v) => { addRow("cases", v); setModal(null); }}
          onEditCase={(id, v) => { editCaseRow(id, v); setModal(null); setEditingCase(null); }}
          onAddTask={(v) => { addRow("tasks", v); setModal(null); setFolderCaseId(null); }}
          onEditTask={(id, v) => { editTaskRow(id, v); setModal(null); setEditingTask(null); }}
          onAddAppt={(v) => { addRow("appts", v); setModal(null); }}
          onAddFinance={(v) => { addRow("finance", v); setModal(null); }}
          onAddEvent={(v) => { addRow("events", v); setModal(null); setFolderCaseId(null); }}
          onAddNote={(v) => { addRow("notes", v); setModal(null); setFolderCaseId(null); }}
          onAddDoc={(v) => { addRow("documents", v); setModal(null); setFolderCaseId(null); }}
          onAddPrecedent={(v) => { addRow("precedents", v); setModal(null); setFolderCaseId(null); }}
        />
      )}
    </div>
  );
}
