import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import "./index.css";
import ErrorPage from "./Error";

// =============================================================
//  Encens Manager — version Supabase complète
//  - Auth Supabase (email + mot de passe, table profiles pour le rôle)
//  - Produits dans table maboutique
//  - Ventes dans table sales
//  - Paiements dans table payments
//  - Styles inchangés (tout passe par index.css)
// =============================================================

// ======================= MAPPINGS SUPABASE ===================

// Produits (table maboutique)
function rowToProduct(row) {
  return {
    id: row.id,
    name: row.nom,
    sku: "",
    category: row.categorie,
    price: Number(row.prix) || 0,
    stock: Number(row.stock) || 0,
    minStock: 0,
    imageUrl: typeof row.image_url === "string" ? row.image_url : null,
  };
}

function productToRow(product) {
  return {
    nom: product.name,
    prix: Number(product.price) || 0,
    stock: Number(product.stock) || 0,
    categorie: product.category || "",
    image_url: product.imageUrl ?? null,
  };
}

// Ventes (table sales)
function rowToSale(row) {
  return {
    id: row.id,
    items: Array.isArray(row.items) ? row.items : [],
    total: Number(row.total) || 0,
    method: row.method || "Cash",
    ref: row.ref || "",
    date: row.date,
    status: row.status || "pending",
    customer: {
      name: row.customer_name || "",
      phone: row.customer_phone || "",
      address: row.customer_address || "",
    },
  };
}

function saleToRow(sale) {
  return {
    id: sale.id,
    date: sale.date,
    method: sale.method,
    ref: sale.ref,
    total: sale.total,
    items: sale.items,
    status: sale.status || "pending",
    customer_name: sale.customer?.name || "",
    customer_phone: sale.customer?.phone || "",
    customer_address: sale.customer?.address || "",
  };
}

// Paiements (table payments)
function rowToPayment(row) {
  return {
    id: row.id,
    saleId: row.sale_id || null,
    method: row.method || "Cash",
    ref: row.ref || "",
    amount: Number(row.amount) || 0,
    date: row.date,
    status: row.status || "pending",
  };
}

function paymentToRow(payment) {
  return {
    id: payment.id,
    sale_id: payment.saleId,
    date: payment.date,
    method: payment.method,
    ref: payment.ref,
    amount: payment.amount,
    status: payment.status,
  };
}

// ============================ APP ============================

export default function App() {
  // ---------- Auth (privé boutique)
  const [users, setUsers] = useLocalStorage("em_users", DEFAULT_USERS);
  const [currentUser, setCurrentUser] = useLocalStorage("em_auth_user", null);

  // ---------- État principal
  const [route, setRoute] = useState("dashboard");

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState(null);

  const [sales, setSales] = useState([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState(null);

  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [paymentsError, setPaymentsError] = useState(null);

  const [currency, setCurrency] = useLocalStorage("em_currency", "EUR");
  const [cloudStatus, setCloudStatus] = useState({
    connected: false,
    last: "Offline",
  });

  // ---------- Chargement initial (produits + ventes + paiements) ----------
  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setProductsLoading(true);
      setSalesLoading(true);
      setPaymentsLoading(true);

      setProductsError(null);
      setSalesError(null);
      setPaymentsError(null);

      try {
        const [prodRes, salesRes, payRes] = await Promise.all([
          supabase
            .from("maboutique")
            .select("id, nom, prix, stock, categorie, image_url")
            .order("id", { ascending: true }),
          supabase.from("sales").select("*").order("date", {
            ascending: false,
          }),
          supabase.from("payments").select("*").order("date", {
            ascending: false,
          }),
        ]);

        if (!cancelled) {
          if (prodRes.error) {
            console.error("Erreur produits :", prodRes.error);
            setProductsError("Impossible de charger les produits.");
            setProducts([]);
          } else {
            setProducts((prodRes.data || []).map(rowToProduct));
          }

          if (salesRes.error) {
            console.error("Erreur ventes :", salesRes.error);
            setSalesError("Impossible de charger les ventes.");
            setSales([]);
          } else {
            setSales((salesRes.data || []).map(rowToSale));
          }

          if (payRes.error) {
            console.error("Erreur paiements :", payRes.error);
            setPaymentsError("Impossible de charger les paiements.");
            setPayments([]);
          } else {
            setPayments((payRes.data || []).map(rowToPayment));
          }

          const hasError = prodRes.error || salesRes.error || payRes.error;
          setCloudStatus({
            connected: !hasError,
            last: hasError ? "Erreur" : "Connected",
          });
        }
      } catch (err) {
        console.error("Erreur chargement global :", err);
        if (!cancelled) {
          setProductsError("Erreur de connexion au serveur.");
          setSalesError("Erreur de connexion au serveur.");
          setPaymentsError("Erreur de connexion au serveur.");
          setCloudStatus({ connected: false, last: "Offline" });
        }
      } finally {
        if (!cancelled) {
          setProductsLoading(false);
          setSalesLoading(false);
          setPaymentsLoading(false);
        }
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- Helpers Produits (Supabase) ----------
  async function createProductOnCloud(draft) {
    const row = productToRow({
      name: draft.name,
      price: draft.price,
      stock: draft.stock,
      category: draft.category,
    });

    const { data, error } = await supabase
      .from("maboutique")
      .insert(row)
      .select("id, nom, prix, stock, categorie, image_url")
      .single();

    if (error) throw error;
    return rowToProduct(data);
  }

  async function updateProductOnCloud(product) {
    if (!product.id) return;
    const row = productToRow(product);
    const { error } = await supabase
      .from("maboutique")
      .update(row)
      .eq("id", product.id)
      .select("id, nom, prix, stock, categorie, image_url")
      .single();
    if (error) throw error;
  }

  async function deleteProductOnCloud(id) {
    if (!id) return;
    const { error } = await supabase
      .from("maboutique")
      .delete()
      .eq("id", id);
    if (error) throw error;
  }

  async function handleCreateProduct(draft) {
    try {
      const created = await createProductOnCloud(draft);
      setProducts((prev) => [...prev, created]);
      setCloudStatus({ connected: true, last: "Connected" });
    } catch (err) {
      console.error("Erreur création produit:", err);
      alert(
        "Erreur lors de l'enregistrement du produit dans Supabase. Il sera seulement en mémoire."
      );
      const localOnly = {
        ...draft,
        id: crypto.randomUUID(),
      };
      setProducts((prev) => [...prev, localOnly]);
      setCloudStatus({ connected: false, last: "Offline" });
    }
  }

  async function handleUpdateProduct(product) {
    setProducts((prev) => prev.map((p) => (p.id === product.id ? product : p)));
    try {
      await updateProductOnCloud(product);
      setCloudStatus({ connected: true, last: "Connected" });
    } catch (err) {
      console.error("Erreur mise à jour produit:", err);
      setCloudStatus({ connected: false, last: "Offline" });
    }
  }

  async function handleDeleteProduct(id) {
    const backup = products;
    setProducts((prev) => prev.filter((p) => p.id !== id));

    try {
      await deleteProductOnCloud(id);
      setCloudStatus({ connected: true, last: "Connected" });
    } catch (err) {
      console.error("Erreur suppression produit:", err);
      alert("Erreur Supabase, restauration de la liste locale.");
      setProducts(backup);
      setCloudStatus({ connected: false, last: "Offline" });
    }
  }

  async function handleAdjustStock(id, delta) {
    const target = products.find((p) => p.id === id);
    if (!target) return;

    const updated = {
      ...target,
      stock: Math.max(0, (Number(target.stock) || 0) + delta),
    };
    await handleUpdateProduct(updated);
  }

  // ---------- Checkout (vente + paiement + mise à jour stock) ----------
  async function handleCheckout({
    cart,
    payMethod,
    ref,
    custName,
    custPhone,
    custAddr,
  }) {
    if (!cart || cart.length === 0) {
      throw new Error("Panier vide");
    }

    const total = cart.reduce(
      (sum, c) => sum + (Number(c.price) || 0) * (Number(c.qty) || 0),
      0
    );
    const items = cart.map((c) => ({
      productId: c.id,
      name: c.name,
      qty: c.qty,
      price: c.price,
    }));

    const saleId = crypto.randomUUID();
    const now = new Date().toISOString();

    const sale = {
      id: saleId,
      items,
      total: Number(total.toFixed(2)),
      method: payMethod,
      ref: ref.trim(),
      date: now,
      status: "paid",
      customer: {
        name: custName.trim(),
        phone: custPhone.trim(),
        address: custAddr.trim(),
      },
    };

    const payment = {
      id: crypto.randomUUID(),
      saleId,
      method: payMethod,
      ref: ref.trim() || `CASH-${saleId.slice(0, 6)}`,
      amount: Number(total.toFixed(2)),
      date: now,
      status: payMethod === "Cash" ? "verified" : "pending",
    };

    // 1) Mise à jour stock local
    setProducts((prev) =>
      prev.map((p) => {
        const it = items.find((i) => i.productId === p.id);
        if (!it) return p;
        return {
          ...p,
          stock: Math.max(0, (Number(p.stock) || 0) - it.qty),
        };
      })
    );

    // 2) Ajout local de la vente et du paiement
    setSales((prev) => [sale, ...prev]);
    setPayments((prev) => [payment, ...prev]);

    // 3) Enregistrement dans Supabase
    try {
      const { error: saleErr } = await supabase
        .from("sales")
        .insert(saleToRow(sale));
      if (saleErr) throw saleErr;

      const { error: payErr } = await supabase
        .from("payments")
        .insert(paymentToRow(payment));
      if (payErr) throw payErr;

      // Mise à jour du stock dans maboutique pour les produits concernés
      for (const it of items) {
        const product = products.find((p) => p.id === it.productId);
        if (product) {
          const updated = {
            ...product,
            stock: Math.max(
              0,
              (Number(product.stock) || 0) - Number(it.qty || 0)
            ),
          };
          await updateProductOnCloud(updated);
        }
      }

      setCloudStatus({ connected: true, last: "Connected" });
    } catch (err) {
      console.error("Erreur enregistrement vente/paiement Supabase:", err);
      setCloudStatus({ connected: false, last: "Offline" });
      // on garde les données en local quand même
    }
  }

    // ---------- Suppression vente + paiements liés ----------
  async function handleDeleteSaleAndPayment(saleId) {
    if (!saleId) return;

    // sauvegarde locale en cas d'erreur Supabase
    const prevSales = sales;
    const prevPayments = payments;

    // 1) On enlève tout de suite côté React
    setSales((old) => old.filter((s) => s.id !== saleId));
    setPayments((old) => old.filter((p) => p.saleId !== saleId));

    try {
      const { error: payErr } = await supabase
        .from("payments")
        .delete()
        .eq("sale_id", saleId);

      if (payErr) throw payErr;

      const { error: saleErr } = await supabase
        .from("sales")
        .delete()
        .eq("id", saleId);

      if (saleErr) throw saleErr;

      setCloudStatus({ connected: true, last: "Connected" });
    } catch (err) {
      console.error("Erreur suppression vente/paiements :", err);
      alert("Erreur Supabase, restauration des données locales.");
      // restauration si erreur
      setSales(prevSales);
      setPayments(prevPayments);
      setCloudStatus({ connected: false, last: "Offline" });
    }
  }

  // ---------- Suppression d’un paiement + vente associée ----------
  async function handleDeletePaymentAndSale(paymentId) {
    const payment = payments.find((p) => p.id === paymentId);
    if (!payment) return;

    const saleId = payment.saleId;
    const backupPayments = payments;
    const backupSales = sales;

    setPayments((prev) => prev.filter((p) => p.id !== paymentId));
    if (saleId) {
      setSales((prev) => prev.filter((s) => s.id !== saleId));
    }

    try {
      const { error: payErr } = await supabase
        .from("payments")
        .delete()
        .eq("id", paymentId);
      if (payErr) throw payErr;

      if (saleId) {
        const { error: saleErr } = await supabase
          .from("sales")
          .delete()
          .eq("id", saleId);
        if (saleErr) throw saleErr;
      }

      setCloudStatus({ connected: true, last: "Connected" });
    } catch (err) {
      console.error("Erreur suppression paiement/vente :", err);
      alert("Erreur lors de la suppression. Restauration locale.");
      setPayments(backupPayments);
      setSales(backupSales);
      setCloudStatus({ connected: false, last: "Offline" });
    }
  }

    // ---------- Mise à jour du statut d'une vente ----------
  async function handleUpdateSaleStatus(saleId, newStatus) {
    if (!saleId) return;

    const prevSales = sales;
    // Optimiste côté UI
    setSales((old) =>
      old.map((s) =>
        s.id === saleId ? { ...s, status: newStatus } : s
      )
    );

    try {
      const { error } = await supabase
        .from("sales")
        .update({ status: newStatus })
        .eq("id", saleId);

      if (error) throw error;
      setCloudStatus({ connected: true, last: "Connected" });
    } catch (err) {
      console.error("Erreur mise à jour statut vente :", err);
      alert("Erreur Supabase, restauration de l'ancien statut.");
      setSales(prevSales);
      setCloudStatus({ connected: false, last: "Offline" });
    }
  }

  // ---------- Auth helpers ----------
  function logout() {
    supabase.auth.signOut();
    setCurrentUser(null);
  }

  function isAdmin() {
    return currentUser?.role === "admin";
  }

  
  // ---------- Mémos ----------
  const stockValue = useMemo(
    () =>
      products.reduce(
        (s, p) => s + (Number(p.price) || 0) * (Number(p.stock) || 0),
        0
      ),
    [products]
  );
  const totalProducts = products.length;
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const todaySalesTotal = useMemo(
    () =>
      sales
        .filter((s) => (s.date || "").startsWith(todayKey))
        .reduce((sum, s) => sum + (s.total || 0), 0),
    [sales, todayKey]
  );

  // =========================================================
  //  GARDIEN : page de connexion tant qu'on n'est pas logué
  // =========================================================
  if (!currentUser) {
    return <LoginPage onLogin={setCurrentUser} />;
  }

    // ========================= RENDER GLOBAL ===================
  return (
    <div className="app-root">
      {/* HEADER */}
      <header className="app-header">
        <div className="app-header-inner">
          <Logo />
          <div className="app-header-right">
            <span
              className={
                "cloud-badge " +
                (cloudStatus.connected ? "cloud-badge--online" : "")
              }
            >
              Cloud: {cloudStatus.connected ? "Connected" : "Offline"}
            </span>
            <span className="header-user">
              {currentUser.email} ·{" "}
              <strong className="header-role">
                {currentUser.role.toUpperCase()}
              </strong>
            </span>
            <button className="btn btn-small" onClick={logout}>
              Se déconnecter
            </button>
          </div>
        </div>
      </header>

      {/* LAYOUT */}
      <div className="app-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <NavButton
            id="dashboard"
            label="Dashboard"
            icon="📊"
            route={route}
            setRoute={setRoute}
          />
          <NavButton
            id="stock"
            label="Stock"
            icon="📦"
            route={route}
            setRoute={setRoute}
          />
          <NavButton
            id="pos"
            label="Ventes"
            icon="🧾"
            route={route}
            setRoute={setRoute}
          />
          <NavButton
            id="payments"
            label="commande boutique"
            icon="💳"
            route={route}
            setRoute={setRoute}
          />
          <NavButton
            id="external"
            label="Commandes extérieur"
            icon="🛒"
            route={route}
            setRoute={setRoute}
          />
          <NavButton
            id="reports"
            label="Rapports"
            icon="📈"
            route={route}
            setRoute={setRoute}
          />
          <NavButton
            id="settings"
            label="Paramètres"
            icon="⚙️"
            route={route}
            setRoute={setRoute}
            hidden={!isAdmin()}
          />
        </aside>

        {/* Main */}
        <main className="page">
          {route === "dashboard" && (
            <Dashboard
              totalProducts={totalProducts}
              stockValue={stockValue}
              todaySalesTotal={todaySalesTotal}
              currency={currency}
              sales={sales}
            />
          )}

          {route === "stock" && (
            <StockPage
              products={products}
              loading={productsLoading}
              error={productsError}
              currency={currency}
              onCreate={handleCreateProduct}
              onUpdate={handleUpdateProduct}
              onDelete={handleDeleteProduct}
              onAdjustStock={handleAdjustStock}
            />
          )}

          {route === "pos" && (
            <POSPage
              products={products}
              currency={currency}
              onCheckout={handleCheckout}
            />
          )}

          {route === "payments" && (
            <PaymentsPage
              payments={payments}
              sales={sales}                    // 👈 on ajoute les ventes
              currency={currency}
              loading={paymentsLoading}
              error={paymentsError}
              onDeleteSaleAndPayment={handleDeleteSaleAndPayment} // si tu as cette fonction
           />
         )}

          {route === "external" && (
            <ExternalOrdersPage
              sales={sales}
              currency={currency}
              onChangeStatus={handleUpdateSaleStatus}   // 👈 très important
           />
         )}

          {route === "reports" && (
            <ReportsPage sales={sales} currency={currency} />
          )}

          {route === "settings" && isAdmin() && (
            <SettingsPage
              currency={currency}
              setCurrency={setCurrency}
              users={users}
              setUsers={setUsers}
            />
          )}
        </main>
      </div>

      <footer className="app-footer">
        <p>
          💡 Accès privé protégé — rôles: Administrateur & Personnel. Pensez à
          changer le mot de passe par défaut.
        </p>
      </footer>
    </div>
  );
}

// =============================================================
//  Page de connexion — Supabase Auth + table profiles
// =============================================================
function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: pwd,
      });

      if (error) {
        console.error("Erreur login Supabase :", error);
        alert("Identifiants incorrects ou problème de connexion.");
        return;
      }

      const user = data.user;
      if (!user) {
        alert("Connexion impossible (pas d'utilisateur retourné).");
        return;
      }

      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profErr) {
        console.warn("Erreur lecture profile :", profErr);
      }

      // 🔒 SI PAS DE PROFIL → ACCÈS REFUSÉ
      if (!profile || !profile.role) {
        await supabase.auth.signOut();
        alert(
         "Accès refusé : ce compte n'est pas autorisé dans la boutique (aucun profil dans la table 'profiles')."
        );
        return;
      }
      
      if (error) {
    return (
      <ErrorPage
        code={error.code}
        title={error.title}
        message={error.message}
        actionLabel="Retour à la connexion"
        onAction={() => setError(null)}
        secondaryLabel="Se déconnecter"
        onSecondary={() => {
          // si tu as une fonction logout
          // logout();
          setError(null);
        }}
      />
    );
  }

      const role = profile.role; // plus de rôle par défaut

      onLogin({
        id: user.id,
        email: user.email,
        role,
      });
    } catch (err) {
      console.error("Erreur inattendue login :", err);
      alert("Erreur inattendue lors de la connexion.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card-header">
          <div className="auth-logo">
            <Logo />
            <span className="auth-subtitle">Accès boutique privé</span>
          </div>
          <h1 className="auth-title">Connexion</h1>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <div className="auth-field">
            <label className="auth-label">Email</label>
            <input
              className="auth-input"
              placeholder="ton-email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="auth-field auth-field-row">
            <div className="auth-field">
              <label className="auth-label">Mot de passe</label>
              <input
                className="auth-input"
                placeholder="Mot de passe"
                type={showPwd ? "text" : "password"}
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="auth-secondary-button"
              onClick={() => setShowPwd((s) => !s)}
            >
              {showPwd ? "Masquer" : "Voir"}
            </button>
          </div>

          <button
            className="auth-primary-button"
            type="submit"
            disabled={loading}
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>

          <p className="auth-help-text">
            Utilise les identifiants créés dans Supabase. Le rôle (admin / staff)
            vient de la table <code>profiles</code>.
          </p>
        </form>
      </div>
    </div>
  );
}

// =============================================================
//  Dashboard
// =============================================================
function Dashboard({
  totalProducts,
  stockValue,
  todaySalesTotal,
  currency,
  sales,
}) {
  const last7 = getLastNDays(7);
  const dailyTotals = last7.map((d) => ({
    d,
    total: sales
      .filter((s) => (s.date || "").startsWith(d))
      .reduce((a, b) => a + (b.total || 0), 0),
  }));

  return (
    <section className="page">
      <h1 className="page-title">Dashboard</h1>
      <div className="grid-3">
        <KPI
          title="Produits"
          value={totalProducts}
          note="Articles en catalogue"
        />
        <KPI
          title="Valeur du stock"
          value={fmtCurrency(stockValue, currency)}
          note="Prix × Quantités"
        />
        <KPI
          title="Ventes (aujourd'hui)"
          value={fmtCurrency(todaySalesTotal, currency)}
          note={new Date().toLocaleDateString()}
        />
      </div>

      <div className="card">
        <h2 className="card-title">Ventes sur 7 jours</h2>
        <MiniBars data={dailyTotals} />
      </div>
    </section>
  );
}

function KPI({ title, value, note }) {
  return (
    <div className="card">
      <div className="kpi-title">{title}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-note">{note}</div>
    </div>
  );
}

function MiniBars({ data }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <div className="mini-bars">
      {data.map(({ d, total }) => {
        const h = (total / max) * 100;
        return (
          <div key={d}>
            <div className="mini-bar" style={{ height: `${h}%` }} />
            <div className="mini-bar-label">{d.slice(5)}</div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================
//  Stock (CRUD + ajustements + modals)
// =============================================================
function StockPage({
  products,
  loading,
  error,
  currency,
  onCreate,
  onUpdate,
  onDelete,
  onAdjustStock,
}) {
  const [q, setQ] = useState("");
  const [openEye, setOpenEye] = useState(false);
  const [current, setCurrent] = useState(null);
  const [openQuickAdd, setOpenQuickAdd] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [editDraft, setEditDraft] = useState(EMPTY_PRODUCT);

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return products;
    return products.filter((p) =>
      [p.name, p.sku, p.category].some((x) =>
        (x || "").toLowerCase().includes(s)
      )
    );
  }, [products, q]);

  function openEyeFor(p) {
    setCurrent(p);
    setOpenEye(true);
  }

  function openEditFor(p) {
    setEditDraft({
      name: p.name,
      sku: p.sku || "",
      category: p.category || "",
      price: p.price,
      stock: p.stock,
      minStock: p.minStock || 0,
    });
    setCurrent(p);
    setOpenEdit(true);
  }

  function handleSaveEdit(e) {
    e?.preventDefault?.();
    if (!current) return;
    if (!editDraft.name || !editDraft.category) {
      alert("Nom et catégorie sont obligatoires.");
      return;
    }
    const updated = {
      ...current,
      name: editDraft.name,
      sku: editDraft.sku,
      category: editDraft.category,
      price: Number(editDraft.price) || 0,
      stock: Number(editDraft.stock) || 0,
      minStock: Number(editDraft.minStock) || 0,
    };
    onUpdate(updated);
    setOpenEdit(false);
    setOpenEye(false);
  }

  async function handleQuickAdd(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const draft = {
      name: String(form.get("name") || "").trim(),
      sku: String(form.get("sku") || "").trim(),
      category: String(form.get("category") || "").trim(),
      price: Number(form.get("price") || 0),
      stock: 0,
      minStock: Number(form.get("minStock") || 0),
    };
    if (!draft.name || !draft.category) {
      alert("Nom et catégorie requis.");
      return;
    }
    await onCreate(draft);
    setOpenQuickAdd(false);
  }

  function handleDeleteCurrent() {
    if (!current) return;
    if (!window.confirm("Supprimer cet article ?")) return;
    onDelete(current.id);
    setOpenEye(false);
  }

  return (
    <section className="page">
      <h1 className="page-title">Stock</h1>

      <div className="toolbar">
        <input
          className="input toolbar-input"
          placeholder="Recherche (nom, SKU, catégorie)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn" onClick={() => setQ("")}>
          Réinitialiser
        </button>
        <button className="btn" onClick={() => setOpenQuickAdd(true)}>
          + Nouveau produit
        </button>
      </div>

      {loading && <div className="info-text">Chargement des produits...</div>}
      {error && <div className="error-text">{error}</div>}

      <div className="card card-scroll">
        <h2 className="card-title">Inventaire ({products.length})</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>SKU</th>
              <th>Cat.</th>
              <th className="text-right">Prix</th>
              <th className="text-right">Stock</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr
                key={p.id || p.name}
                className={
                  p.minStock && p.stock <= p.minStock ? "row-low-stock" : ""
                }
              >
                <td>{p.name}</td>
                <td>{p.sku || "—"}</td>
                <td>{p.category}</td>
                <td className="text-right">
                  {fmtCurrency(p.price, currency)}
                </td>
                <td className="text-right">{p.stock}</td>
                <td className="text-right">
                  <div className="table-actions">
                    <button
                      className="btn btn-small"
                      onClick={() => onAdjustStock(p.id, +1)}
                    >
                      +1
                    </button>
                    <button
                      className="btn btn-small"
                      onClick={() => onAdjustStock(p.id, -1)}
                    >
                      -1
                    </button>
                    <button
                      className="btn btn-small"
                      onClick={() => openEyeFor(p)}
                      title="Voir"
                    >
                      👁
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="table-empty">
                  Aucun produit pour l’instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal vue produit */}
      <Modal
        open={openEye}
        title={current ? `Produit: ${current.name}` : "Produit"}
        onClose={() => setOpenEye(false)}
      >
        {current && (
          <div className="modal-body">
            <div className="modal-info">
              <div>
                SKU: <strong>{current.sku || "—"}</strong>
              </div>
              <div>
                Catégorie: <strong>{current.category}</strong>
              </div>
              <div>
                Prix: <strong>{fmtCurrency(current.price, currency)}</strong>
              </div>
              <div>
                Stock: <strong>{current.stock}</strong>
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="btn"
                onClick={() => {
                  setOpenEye(false);
                  openEditFor(current);
                }}
              >
                Éditer
              </button>
              <button className="btn" onClick={handleDeleteCurrent}>
                Supprimer
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal édition */}
      <Modal
        open={openEdit}
        title={current ? `Éditer: ${current.name}` : "Éditer produit"}
        onClose={() => setOpenEdit(false)}
      >
        <form className="grid-2" onSubmit={handleSaveEdit}>
          <input
            className="input grid-span-2"
            placeholder="Nom"
            value={editDraft.name}
            onChange={(e) =>
              setEditDraft((d) => ({ ...d, name: e.target.value }))
            }
          />
          <input
            className="input"
            placeholder="SKU"
            value={editDraft.sku}
            onChange={(e) =>
              setEditDraft((d) => ({ ...d, sku: e.target.value }))
            }
          />
          <input
            className="input"
            placeholder="Catégorie"
            value={editDraft.category}
            onChange={(e) =>
              setEditDraft((d) => ({ ...d, category: e.target.value }))
            }
          />
          <input
            className="input"
            type="number"
            placeholder="Prix"
            value={editDraft.price}
            onChange={(e) =>
              setEditDraft((d) => ({ ...d, price: e.target.value }))
            }
          />
          <input
            className="input"
            type="number"
            placeholder="Stock"
            value={editDraft.stock}
            onChange={(e) =>
              setEditDraft((d) => ({ ...d, stock: e.target.value }))
            }
          />
          <input
            className="input"
            type="number"
            placeholder="Seuil alerte (min)"
            value={editDraft.minStock}
            onChange={(e) =>
              setEditDraft((d) => ({ ...d, minStock: e.target.value }))
            }
          />
          <div className="grid-span-2 modal-footer-buttons">
            <button
              type="button"
              className="btn"
              onClick={() => setOpenEdit(false)}
            >
              Annuler
            </button>
            <button type="submit" className="btn btn-primary">
              Enregistrer
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal ajout rapide */}
      <Modal
        open={openQuickAdd}
        title="Nouveau produit (sans stock)"
        onClose={() => setOpenQuickAdd(false)}
      >
        <form className="grid-2" onSubmit={handleQuickAdd}>
          <input
            name="name"
            className="input grid-span-2"
            placeholder="Nom"
          />
          <input name="sku" className="input" placeholder="SKU" />
          <input
            name="category"
            className="input"
            placeholder="Catégorie"
          />
          <input
            name="price"
            type="number"
            step="0.01"
            className="input"
            placeholder="Prix"
          />
          <input
            name="minStock"
            type="number"
            className="input"
            placeholder="Seuil alerte (min)"
          />
          <button className="btn btn-primary grid-span-2" type="submit">
            Ajouter
          </button>
        </form>
      </Modal>
    </section>
  );
}

// =============================================================
//  POS — Ventes
// =============================================================
function POSPage({ products, currency, onCheckout }) {
  const [q, setQ] = useState("");
  const [cart, setCart] = useState([]);
  const [payMethod, setPayMethod] = useState("Cash");
  const [ref, setRef] = useState("");
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custAddr, setCustAddr] = useState("");

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return products;
    return products.filter((p) =>
      [p.name, p.sku, p.category].some((x) =>
        (x || "").toLowerCase().includes(s)
      )
    );
  }, [products, q]);

  const total = cart.reduce((sum, c) => sum + c.price * c.qty, 0);

  function add(p) {
    setCart((prev) => {
      const ex = prev.find((x) => x.id === p.id);
      if (ex)
        return prev.map((x) =>
          x.id === p.id ? { ...x, qty: x.qty + 1 } : x
        );
      return [
        ...prev,
        { id: p.id, name: p.name, price: p.price, qty: 1 },
      ];
    });
  }

  function setQty(id, qty) {
    const v = Math.max(1, Number(qty) || 1);
    setCart((prev) =>
      prev.map((x) => (x.id === id ? { ...x, qty: v } : x))
    );
  }

  function removeItem(id) {
    setCart((prev) => prev.filter((x) => x.id !== id));
  }

  async function checkout() {
    if (cart.length === 0) return alert("Panier vide");
    if (payMethod !== "Cash" && !ref.trim())
      return alert("Saisis une référence (Ria/MG/OM)");

    try {
      await onCheckout({
        cart,
        payMethod,
        ref,
        custName,
        custPhone,
        custAddr,
      });

      alert(
        `Vente enregistrée. Paiement ${payMethod}${
          ref.trim() ? ` (ref: ${ref.trim()})` : ""
        }.`
      );
      setCart([]);
      setRef("");
      setCustName("");
      setCustPhone("");
      setCustAddr("");
    } catch (err) {
      console.error("Erreur checkout:", err);
      alert("Erreur lors de l'enregistrement de la vente.");
    }
  }

  return (
    <section className="page">
      <h1 className="page-title">Point de Vente</h1>
      <div className="layout-2">
        {/* Liste produits */}
        <div className="page-col">
          <div className="toolbar">
            <input
              className="input toolbar-input"
              placeholder="Rechercher produit (nom, SKU, catégorie)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="btn" onClick={() => setQ("")}>
              Réinitialiser
            </button>
          </div>

          <div className="grid-products">
            {filtered.map((p) => (
              <article key={p.id || p.name} className="card card-product">
                {/* IMAGE DU PRODUIT */}
                {p.imageUrl ? (
                  <div className="product-image-wrapper">
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      className="product-image"
                   />
                 </div>
               ) : (
                 <div className="product-image-placeholder">
                   Image
                 </div>
               )}

               <h3 className="product-title">{p.name}</h3>
               <p className="product-sub">
                 {p.category || "–"} · Stock: {p.stock}
               </p>

               <div className="product-bottom">
                 <span className="product-price">
                   {fmtCurrency(p.price, currency)}
                 </span>
                 <button
                   className="btn btn-primary btn-small"
                   onClick={() => add(p)}
                 >
                   Ajouter
                 </button>
               </div>
             </article>
            ))}
          </div>
        </div>

        {/* Panier */}
        <div className="page-col">
          <div className="card">
            <h2 className="card-title">Panier</h2>
            {cart.length === 0 && (
              <p className="info-text">Aucun article dans le panier.</p>
            )}
            {cart.length > 0 && (
              <ul className="cart-list">
                {cart.map((item) => (
                  <li key={item.id} className="cart-item">
                    <div className="cart-main">
                      <div className="cart-name">{item.name}</div>
                      <div className="cart-price">
                        {fmtCurrency(item.price, currency)}
                      </div>
                    </div>
                    <div className="cart-controls">
                      <input
                        type="number"
                        className="input input-qty"
                        min={1}
                        value={item.qty}
                        onChange={(e) =>
                          setQty(item.id, e.target.value)
                        }
                      />
                      <button
                        className="btn btn-small"
                        onClick={() => removeItem(item.id)}
                      >
                        Retirer
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="cart-total">
              <span>Total :</span>
              <strong>{fmtCurrency(total, currency)}</strong>
            </div>
          </div>

          <div className="card">
            <h2 className="card-title">Client & Paiement</h2>
            <div className="grid-2">
              <input
                className="input grid-span-2"
                placeholder="Nom du client"
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
              />
              <input
                className="input"
                placeholder="Téléphone"
                value={custPhone}
                onChange={(e) => setCustPhone(e.target.value)}
              />
              <input
                className="input"
                placeholder="Adresse"
                value={custAddr}
                onChange={(e) => setCustAddr(e.target.value)}
              />
              <select
                className="select grid-span-2"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
              >
                {PAY_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              {payMethod !== "Cash" && (
                <input
                  className="input grid-span-2"
                  placeholder="Référence (Ria / MoneyGram / Orange Money)"
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                />
              )}
            </div>
            <button
              className="btn btn-primary btn-block"
              onClick={checkout}
            >
              Valider la vente
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================
//  Paiements
// =============================================================
function PaymentsPage({
  payments,
  sales,
  currency,
  loading,
  error,
  onDeleteSaleAndPayment,
}) {
  const [filter, setFilter] = useState("Tous");
  const [open, setOpen] = useState(false);
  const [currentPayment, setCurrentPayment] = useState(null);

  const filtered = useMemo(() => {
    if (filter === "Tous") return payments;
    return payments.filter((p) => p.method === filter);
  }, [payments, filter]);

  // Vente liée au paiement sélectionné (pour infos client + articles)
  const currentSale = useMemo(() => {
    if (!currentPayment || !sales) return null;
    return sales.find((s) => s.id === currentPayment.saleId) || null;
  }, [currentPayment, sales]);

  function openModal(p) {
    setCurrentPayment(p);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setCurrentPayment(null);
  }

  async function handleDelete() {
    if (!currentPayment || !onDeleteSaleAndPayment) return;
    if (!window.confirm("Supprimer cette vente et son paiement ?")) return;

    try {
      await onDeleteSaleAndPayment(currentPayment.saleId, currentPayment.id);
      closeModal();
    } catch (err) {
      console.error("Erreur suppression vente/paiement :", err);
      alert("Erreur Supabase, restauration des données locales.");
    }
  }

  return (
    <section className="page">
      <h1 className="page-title">Paiements</h1>

      <div className="card">
        <div className="toolbar">
          <div className="toolbar-label">
            Historique ({payments.length})
          </div>
          <select
            className="select"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="Tous">Tous</option>
            {PAY_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            className="btn"
            onClick={() => {
              const header = "date,method,ref,amount,status";
              const rows = filtered.map((p) =>
                [p.date, p.method, p.ref, p.amount, p.status].join(",")
              );
              const csv = [header, ...rows].join("\n");
              const blob = new Blob([csv], {
                type: "text/csv;charset=utf-8",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "paiements.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Exporter CSV
          </button>
        </div>

        {loading && <div className="info-text">Chargement...</div>}
        {error && <div className="error-text">{error}</div>}

        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Méthode</th>
              <th>Réf.</th>
              <th>Montant</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.date).toLocaleString()}</td>
                <td>{p.method}</td>
                <td>{p.ref}</td>
                <td>{fmtCurrency(p.amount, currency)}</td>
                <td>{p.status}</td>
                <td>
                  <button
                    className="btn-icon"
                    onClick={() => openModal(p)}
                    title="Voir détails"
                  >
                    👁
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="table-empty">
                  Aucun paiement enregistré.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal détails paiement + client */}
      <Modal
        open={open}
        title={
          currentPayment
            ? `Paiement ${currentPayment.method}`
            : "Paiement"
        }
        onClose={closeModal}
      >
        {currentPayment && (
          <div className="modal-body">
            <div className="modal-info">
              <div>
                Date :{" "}
                <strong>
                  {new Date(currentPayment.date).toLocaleString()}
                </strong>
              </div>
              <div>
                Méthode : <strong>{currentPayment.method}</strong>
              </div>
              <div>
                Référence : <strong>{currentPayment.ref || "—"}</strong>
              </div>
              <div>
                Montant :{" "}
                <strong>
                  {fmtCurrency(currentPayment.amount, currency)}
                </strong>
              </div>
              <div>
                Statut : <strong>{currentPayment.status}</strong>
              </div>
            </div>

            <hr />

            <h3 className="modal-subtitle">Client</h3>
            {currentSale ? (
              <>
                <div>
                  Nom :{" "}
                  <strong>{currentSale.customer?.name || "—"}</strong>
                </div>
                <div>
                  Téléphone :{" "}
                  <strong>{currentSale.customer?.phone || "—"}</strong>
                </div>
                <div>
                  Adresse :{" "}
                  <strong>{currentSale.customer?.address || "—"}</strong>
                </div>

                {Array.isArray(currentSale.items) &&
                  currentSale.items.length > 0 && (
                    <>
                      <h4 className="modal-subtitle" style={{ marginTop: 12 }}>
                        Articles
                      </h4>
                      <table className="table table-compact">
                        <thead>
                          <tr>
                            <th>Produit</th>
                            <th>Qté</th>
                            <th>Prix</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentSale.items.map((it) => (
                            <tr key={it.productId || it.name}>
                              <td>{it.name}</td>
                              <td>{it.qty}</td>
                              <td>
                                {fmtCurrency(it.price, currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
              </>
            ) : (
              <p className="info-text">
                Aucune information client trouvée pour cette vente.
              </p>
            )}

            <div className="modal-actions">
              <button className="btn" onClick={closeModal}>
                Fermer
              </button>
              {onDeleteSaleAndPayment && (
                <button
                  className="btn btn-primary"
                  onClick={handleDelete}
                >
                  Supprimer la vente
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}

// =============================================================
//  Commandes Clients (Encens Client) avec statut
// =============================================================
function ExternalOrdersPage({ sales, currency, onChangeStatus }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(null);

  // SEULEMENT commandes venant d'Encens Client
  const external = useMemo(
    () => sales.filter((s) => s.method === "ENCENS_CLIENT"),
    [sales]
  );

  function handleStatusChange(saleId, newStatus) {
    if (!onChangeStatus) return;
    onChangeStatus(saleId, newStatus);
  }

  return (
    <section className="page">
      <h1 className="page-title">Commandes Clients</h1>

      <div className="card">
        <div className="toolbar">
          <div className="toolbar-label">
            Commandes reçues ({external.length})
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Client</th>
              <th>Téléphone</th>
              <th>Total</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {external.map((s) => (
              <tr key={s.id}>
                <td>{new Date(s.date).toLocaleString()}</td>
                <td>{s.customer?.name || "—"}</td>
                <td>{s.customer?.phone || "—"}</td>
                <td>{fmtCurrency(s.total, currency)}</td>
                <td>
                  <select
                    className="select select-small"
                    value={s.status || "pending"}
                    onChange={(e) =>
                      handleStatusChange(s.id, e.target.value)
                    }
                  >
                    {ORDER_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    className="btn-icon"
                    onClick={() => {
                      setCurrent(s);
                      setOpen(true);
                    }}
                  >
                    👁
                  </button>
                </td>
              </tr>
            ))}

            {external.length === 0 && (
              <tr>
                <td colSpan={6} className="table-empty">
                  Aucune commande client pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        title={current ? "Commande Client" : "Commande"}
        onClose={() => setOpen(false)}
      >
        {current && (
          <div className="modal-body">
            <div className="modal-info">
              <div>
                Date :{" "}
                <strong>
                  {new Date(current.date).toLocaleString()}
                </strong>
              </div>
              <div>
                Statut :{" "}
                <strong>{current.status || "pending"}</strong>
              </div>
              <div>
                Client :{" "}
                <strong>{current.customer?.name || "—"}</strong>
              </div>
              <div>
                Téléphone :{" "}
                <strong>{current.customer?.phone || "—"}</strong>
              </div>
              <div>
                Adresse :{" "}
                <strong>{current.customer?.address || "—"}</strong>
              </div>
              <div>
                Total :{" "}
                <strong>{fmtCurrency(current.total, currency)}</strong>
              </div>
            </div>

            {Array.isArray(current.items) && current.items.length > 0 && (
              <>
                <h3 className="modal-subtitle" style={{ marginTop: 12 }}>
                  Articles
                </h3>
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>Qté</th>
                      <th>Prix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.items.map((it, idx) => (
                      <tr key={idx}>
                        <td>{it.name}</td>
                        <td>{it.qty}</td>
                        <td>{fmtCurrency(it.price, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <div className="modal-actions">
              <button className="btn" onClick={() => setOpen(false)}>
                Fermer
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}

// =============================================================
//  Rapports (total par jour)
// =============================================================
function ReportsPage({ sales, currency }) {
  const [selectedDate, setSelectedDate] = useState("");
  const [originFilter, setOriginFilter] = useState("Tous"); // 👈 NOUVEAU

  const uniqueDates = Array.from(
    new Set(sales.map((s) => (s.date || "").slice(0, 10)))
  ).sort((a, b) => (a < b ? 1 : -1));

  const dateToShow =
    selectedDate || (uniqueDates.length ? uniqueDates[0] : "");

  // Filtre origine (POS vs Encens Client)
  const filteredByOrigin = sales.filter((s) => {
    if (originFilter === "Tous") return true;
    if (originFilter === "Encens Client")
      return s.method === "ENCENS_CLIENT";
    if (originFilter === "POS interne")
      return s.method !== "ENCENS_CLIENT";
    return true;
  });

  const dailySales = filteredByOrigin.filter((s) =>
    (s.date || "").startsWith(dateToShow)
  );
  const total = dailySales.reduce((sum, s) => sum + (s.total || 0), 0);

  return (
    <section className="page">
      <h1 className="page-title">Rapports</h1>

      <div className="card">
        <h2 className="card-title">Total journalier</h2>
        <div className="grid-2">
          <select
            className="select"
            value={dateToShow}
            onChange={(e) => setSelectedDate(e.target.value)}
          >
            {uniqueDates.map((d) => (
              <option key={d} value={d}>
                {new Date(d).toLocaleDateString()}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={originFilter}
            onChange={(e) => setOriginFilter(e.target.value)}
          >
            <option value="Tous">Toutes les ventes</option>
            <option value="POS interne">POS interne</option>
            <option value="Encens Client">Encens Client</option>
          </select>

          <div className="kpi-value grid-span-2">
            {fmtCurrency(total, currency)}
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Heure</th>
              <th>Origine</th>
              <th>Méthode</th>
              <th>Réf.</th>
              <th>Statut</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {dailySales.map((s) => (
              <tr key={s.id}>
                <td>
                  {new Date(s.date).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td>
                  {s.method === "ENCENS_CLIENT"
                    ? "Encens Client"
                    : "POS interne"}
                </td>
                <td>{s.method}</td>
                <td>{s.ref}</td>
                <td>{s.status || "pending"}</td>
                <td>{fmtCurrency(s.total, currency)}</td>
              </tr>
            ))}
            {dailySales.length === 0 && (
              <tr>
                <td colSpan={6} className="table-empty">
                  Aucune vente pour cette date / ce filtre.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// =============================================================
//  Réglages (devise + utilisateurs locaux)
// =============================================================
function SettingsPage({ currency, setCurrency, users, setUsers }) {
  return (
    <section className="page">
      <h1 className="page-title">Réglages</h1>

      <div className="card">
        <h2 className="card-title">Devise</h2>
        <select
          className="select select-small"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <p className="info-text">
          La devise affecte uniquement l'affichage. Les montants restent
          numériques.
        </p>
      </div>

      <div className="card">
        <h2 className="card-title">Utilisateurs</h2>
        <UserAdmin users={users} setUsers={setUsers} />
      </div>
    </section>
  );
}

function UserAdmin({ users, setUsers }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("staff");

  async function addUser(e) {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      return alert("Email et mot de passe requis");
    }

    const exists = (users || []).some(
      (u) => u.email.trim().toLowerCase() === email.trim().toLowerCase()
    );
    if (exists) {
      return alert("Un utilisateur avec cet email existe déjà");
    }

    try {
      // 🔗 APPEL DE LA EDGE FUNCTION create-user
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            email,
            password,
            role,
          }),
        }
      );

      const data = await res.json().catch(() => ({}));

      console.log("Réponse create-user:", data);
      console.log("userId reçu:", data.userId);

      if (!res.ok || data.success === false || !data.userId) {
        console.error("Erreur create-user:", data);
        alert(
          data.error ||
            "Impossible de créer l'utilisateur dans Supabase (userId manquant)."
        );
        return;
      }

      // ✅ Si tout est bon côté Supabase, on garde aussi un backup local
      setUsers([
        ...(users || []),
        {
          id: data.userId,          // ID principal côté Encens
          supabaseId: data.userId,  // ID Supabase pour la suppression
          email: email.trim(),
          password,
          role,
        },
      ]);

      setEmail("");
      setPassword("");
      setRole("staff");

      alert("Utilisateur créé dans Supabase + Encens Manager ✅");
    } catch (err) {
      console.error("Erreur appel Edge Function:", err);
      alert(
        "Erreur réseau en appelant Supabase. Vérifie ta connexion Internet."
      );
    }
  }

  // 🗑 Supprimer un utilisateur (Supabase + localStorage)
  async function removeUser(id) {
    const user = (users || []).find((u) => u.id === id);

    if (!user) {
      console.warn("Utilisateur introuvable côté Encens pour id:", id);
      return;
    }

    if (!window.confirm(`Supprimer l'utilisateur ${user.email} ?`)) return;

    try {
      // Si on a un supabaseId, on supprime aussi dans Supabase Auth
      if (user.supabaseId) {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ userId: user.supabaseId }),
          }
        );

        const data = await res.json().catch(() => ({}));
        console.log("Réponse delete-user:", data);

        if (!res.ok || data.success === false) {
          console.error("Erreur delete-user:", data);
          alert(
            data.error ||
              "Impossible de supprimer l'utilisateur dans Supabase."
          );
          return;
        }
      }

      // 🧹 Mise à jour côté Encens (state + localStorage via useLocalStorage)
      setUsers((users || []).filter((u) => u.id !== id));
    } catch (err) {
      console.error("Erreur appel delete-user:", err);
      alert(
        "Erreur réseau en appelant Supabase (delete-user). Vérifie ta connexion Internet."
      );
    }
  }

  return (
    <div className="user-admin">
      <form className="grid-2" onSubmit={addUser}>
        <input
          className="input grid-span-2"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="input"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <select
          className="select"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="admin">admin</option>
          <option value="staff">staff</option>
        </select>
        <button className="btn btn-primary grid-span-2" type="submit">
          Ajouter
        </button>
      </form>

      <div className="user-table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Rôle</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(users || []).map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td className="text-right">
                  <button
                    className="btn btn-small"
                    onClick={() => removeUser(u.id)}
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
            {(!users || users.length === 0) && (
              <tr>
                <td colSpan={3} className="table-empty">
                  Aucun utilisateur configuré.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================
//  Modal générique
// =============================================================
function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-card">
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="btn btn-small" onClick={onClose}>
            Fermer
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// =============================================================
//  Utilitaires & constantes
// =============================================================
const EMPTY_PRODUCT = {
  name: "",
  sku: "",
  category: "",
  price: "",
  stock: "",
  minStock: 0,
};

const PAY_METHODS = ["Cash", "Orange Money", "Wave", "Carte"];
const CURRENCIES = ["XOF"];

// 🔥 Statuts possibles des commandes
const ORDER_STATUSES = ["pending", "payé", "livré",];

const DEFAULT_USERS = [
  {
    id: "u_admin",
    email: "admin@shop.local",
    password: "admin123",
    role: "admin",
  },
  {
    id: "u_staff",
    email: "staff@shop.local",
    password: "staff123",
    role: "staff",
  },
];

function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  }, [key, value]);
  return [value, setValue];
}

function fmtCurrency(v, currency) {
  const n = Number(v || 0);
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
    }).format(n);
  } catch {
    return n.toFixed(2) + " " + currency;
  }
}

function getLastNDays(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(isoDaysAgo(i));
  return out;
}

function isoDaysAgo(i) {
  const d = new Date();
  d.setDate(d.getDate() - i);
  return d.toISOString().slice(0, 10);
}

function Logo() {
  return (
    <div className="logo">
      <div className="logo-icon" />
      <span className="logo-text">Encens Manager</span>
    </div>
  );
}

function NavButton({ id, label, icon, route, setRoute, hidden }) {
  if (hidden) return null;
  const active = route === id;
  return (
    <button
      onClick={() => setRoute(id)}
      className={`nav-button ${active ? "nav-button--active" : ""}`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
