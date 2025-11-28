// src/ErrorPage.jsx

export default function ErrorPage({
  title = "Oups, quelque chose s'est mal passé 😕",
  message = "Une erreur inattendue est survenue. Merci de réessayer dans quelques instants.",
  code,             // ex : "403", "500", etc. (optionnel)
  actionLabel,      // ex : "Réessayer", "Retour", etc. (optionnel)
  onAction,         // callback bouton principal (optionnel)
  secondaryLabel,   // ex : "Se déconnecter" (optionnel)
  onSecondary,      // callback bouton secondaire (optionnel)
}) {
  return (
    <div className="error-page">
      <div className="error-card">
        {code && <div className="error-code">{code}</div>}

        <h1 className="error-title">{title}</h1>

        <p className="error-message">
          {message}
        </p>

        <div className="error-actions">
          {actionLabel && onAction && (
            <button className="btn btn-primary" onClick={onAction}>
              {actionLabel}
            </button>
          )}

          {secondaryLabel && onSecondary && (
            <button className="btn btn-secondary" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          )}
        </div>

        <p className="error-small">
          Si le problème persiste, contactez l’administrateur de la boutique.
        </p>
      </div>
    </div>
  );
}
