import { useEffect, useState } from "react";
import { ArrowLeftRight, Inbox } from "lucide-react";
import api, { apiErrorMessage } from "../lib/api";
import { Alert, EmptyState, Field, Loading, Modal, StatusBadge } from "../components/ui";
import { formatDate } from "../lib/format";

const STATUS_TONE = {
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  CANCELLED: "slate",
};

export default function Transfers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deciding, setDeciding] = useState(null); // { request, approve: bool }

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/employees/transfers/", { params: { page_size: 200 } });
      setRows(data.results || data);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load transfer requests."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const pending = rows.filter((r) => r.status === "PENDING");
  const history = rows.filter((r) => r.status !== "PENDING");

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Module 3</div>
          <h1>Transfer requests</h1>
          <p className="page-sub">Requests to move an employee to a different branch, awaiting manager or admin approval.</p>
        </div>
      </div>

      <Alert>{error}</Alert>

      <div className="card">
        <div className="table-toolbar">
          <span className="card-head-sub">
            {pending.length} pending · {history.length} decided
          </span>
        </div>

        {loading ? (
          <Loading label="Loading transfer requests…" />
        ) : rows.length === 0 ? (
          <EmptyState icon={Inbox} title="No transfer requests" message="Transfer requests raised from the Employees page will show up here." />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Requested by</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...pending, ...history].map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="cell-primary">{r.employee_name}</div>
                      <div className="cell-sub">{r.employee_code}</div>
                    </td>
                    <td>{r.from_branch_name || "—"}</td>
                    <td>{r.to_branch_name}</td>
                    <td>{r.requested_by_name || "—"}</td>
                    <td style={{ maxWidth: 220 }} className="cell-sub">
                      {r.reason || "—"}
                    </td>
                    <td>
                      <StatusBadge tone={STATUS_TONE[r.status] || "slate"}>{r.status}</StatusBadge>
                      {r.status !== "PENDING" && r.decided_by_name && (
                        <div className="cell-sub" style={{ marginTop: 3 }}>
                          by {r.decided_by_name} · {formatDate(r.decided_at)}
                        </div>
                      )}
                    </td>
                    <td>
                      {r.status === "PENDING" && (
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button className="btn btn-sm" onClick={() => setDeciding({ request: r, approve: false })}>
                            Reject
                          </button>
                          <button className="btn btn-sm btn-primary" onClick={() => setDeciding({ request: r, approve: true })}>
                            Approve
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deciding && (
        <DecisionModal
          request={deciding.request}
          approve={deciding.approve}
          onClose={() => setDeciding(null)}
          onDone={() => {
            setDeciding(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function DecisionModal({ request, approve, onClose, onDone }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const action = approve ? "approve" : "reject";
      await api.post(`/employees/transfers/${request.id}/${action}/`, { decision_note: note });
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't record your decision."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={approve ? "Approve transfer?" : "Reject transfer?"}
      subtitle={`${request.employee_name}: ${request.from_branch_name || "No location"} → ${request.to_branch_name}`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>
        <Alert>{error}</Alert>
        <Field label="Note (optional)">
          <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className={`btn ${approve ? "btn-primary" : "btn-danger"}`} disabled={submitting}>
            {submitting ? "Saving…" : approve ? "Approve" : "Reject"}
          </button>
        </div>
      </form>
    </Modal>
  );
}