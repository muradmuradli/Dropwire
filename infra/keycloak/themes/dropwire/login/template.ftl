<#--
  Dropwire's own login page shell, overriding keycloak.v2's template.ftl (which was pulling in
  PatternFly's Login/Container/Main grid component — see dropwire.css's old history for why that
  was fighting us). This drops PatternFly's layout classes entirely for the page shell and replaces
  them with a handful of our own (dw-*), while keeping every bit of the original control flow
  (required-fields legend, "show username"/"try another way", language picker, alert messages,
  info section, social providers) so registration/OTP/WebAuthn/forgot-password etc. keep working —
  only the markup/classes changed, not the logic. Field-level markup (labels/inputs/buttons) still
  comes from the inherited field.ftl/buttons.ftl, which still emit PatternFly's form classes
  (pf-v5-c-form-control, pf-v5-c-button, etc.) — dropwire.css already styles those directly, so
  they're untouched here.
-->
<#import "field.ftl" as field>
<#import "footer.ftl" as loginFooter>
<#macro username>
  <#assign label>
    <#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if>
  </#assign>
  <@field.group name="username" label=label>
    <div class="${properties.kcInputGroup}">
      <div class="${properties.kcInputGroupItemClass} ${properties.kcFill}">
        <span class="${properties.kcInputClass} ${properties.kcFormReadOnlyClass}">
          <input id="kc-attempted-username" value="${auth.attemptedUsername}" readonly>
        </span>
      </div>
      <div class="${properties.kcInputGroupItemClass}">
        <button id="reset-login" class="${properties.kcFormPasswordVisibilityButtonClass} kc-login-tooltip" type="button"
              aria-label="${msg('restartLoginTooltip')}" onclick="location.href='${url.loginRestartFlowUrl}'">
            <i class="fa-sync-alt fas" aria-hidden="true"></i>
            <span class="kc-tooltip-text">${msg("restartLoginTooltip")}</span>
        </button>
      </div>
    </@field.group>
</#macro>

<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false>
<!DOCTYPE html>
<html<#if realm.internationalizationEnabled> lang="${locale.currentLanguageTag}" dir="${(locale.rtl)?then('rtl','ltr')}"</#if>>

<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width,initial-scale=1"/>

    <#-- Sync with apps/web's theme toggle. localStorage isn't shared across origins, so the app
         passes its current theme once via a `ui_theme` query param when it sends the browser here
         (see auth-nav.tsx); we persist that to THIS origin's own localStorage so it survives
         Keycloak's own internal navigation (register, forgot password, OTP, ...), which won't
         carry the query param forward on its own. Runs synchronously, before any stylesheet, so
         there's no flash of the wrong theme. -->
    <script>
        (function () {
            try {
                var fromUrl = new URLSearchParams(window.location.search).get('ui_theme');
                if (fromUrl === 'dark' || fromUrl === 'light') {
                    localStorage.setItem('dw-theme', fromUrl);
                }
                if ((localStorage.getItem('dw-theme') || 'light') === 'dark') {
                    document.documentElement.classList.add('dark');
                }
            } catch (e) {}
        })();
    </script>

    <title>${msg("loginTitle",(realm.displayName!''))}</title>
    <link rel="icon" href="${url.resourcesPath}/img/favicon.ico" />
    <#if properties.stylesCommon?has_content>
        <#list properties.stylesCommon?split(' ') as style>
            <link href="${url.resourcesCommonPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
    <#if properties.styles?has_content>
        <#list properties.styles?split(' ') as style>
            <link href="${url.resourcesPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
    <script type="importmap">
        {
            "imports": {
                "rfc4648": "${url.resourcesCommonPath}/vendor/rfc4648/rfc4648.js"
            }
        }
    </script>
    <#if properties.scripts?has_content>
        <#list properties.scripts?split(' ') as script>
            <script src="${url.resourcesPath}/${script}" type="text/javascript"></script>
        </#list>
    </#if>
    <#if scripts??>
        <#list scripts as script>
            <script src="${script}" type="text/javascript"></script>
        </#list>
    </#if>
    <script type="module" src="${url.resourcesPath}/js/passwordVisibility.js"></script>
    <script type="module">
        import { startSessionPolling } from "${url.resourcesPath}/js/authChecker.js";
        startSessionPolling("${url.ssoLoginInOtherTabsUrl?no_esc}");
    </script>
</head>

<body>
<div class="dw-shell">
  <div class="dw-panel">
    <header class="dw-brand">
      <#if client?? && client.baseUrl?has_content>
        <#-- client.baseUrl is the dropwire-web client's configured "Home URL" (apps/web's origin)
             — lets someone who opened the sign-in page by mistake get back to the app without
             signing in. See infra/keycloak/realm-export.json's client config. -->
        <a href="${client.baseUrl}" class="dw-brand-link" aria-label="Back to Dropwire">
          <div class="dw-brand-mark"></div>
          <span>${kcSanitize(msg("loginTitleHtml",(realm.displayNameHtml!'')))?no_esc}</span>
        </a>
      <#else>
        <div class="dw-brand-mark"></div>
        <span>${kcSanitize(msg("loginTitleHtml",(realm.displayNameHtml!'')))?no_esc}</span>
      </#if>
    </header>

    <h1 class="dw-title" id="kc-page-title"><#nested "header"></h1>

    <#if realm.internationalizationEnabled && locale.supported?size gt 1>
      <div class="dw-lang-select">
        <select aria-label="${msg("languages")}" id="login-select-toggle" onchange="if (this.value) window.location.href=this.value">
          <#list locale.supported?sort_by("label") as l>
            <option value="${l.url}" ${(l.languageTag == locale.currentLanguageTag)?then('selected','')}>${l.label}</option>
          </#list>
        </select>
      </div>
    </#if>

    <#if !(auth?has_content && auth.showUsername() && !auth.showResetCredentials())>
        <#if displayRequiredFields>
            <p class="dw-required-legend"><span class="dw-required-mark">*</span> ${msg("requiredFields")}</p>
        </#if>
    <#else>
        <#if displayRequiredFields>
            <p class="dw-required-legend"><span class="dw-required-mark">*</span> ${msg("requiredFields")}</p>
        </#if>
        <#nested "show-username">
        <@username />
    </#if>

    <#-- App-initiated actions should not see warning messages about the need to complete the action during login. -->
    <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
        <div class="dw-alert dw-alert-${message.type}">
            <span class="dw-alert-text">${kcSanitize(message.summary)?no_esc}</span>
        </div>
    </#if>

    <#nested "form">

    <#if auth?has_content && auth.showTryAnotherWayLink()>
      <form id="kc-select-try-another-way-form" action="${url.loginAction}" method="post" novalidate="novalidate">
          <input type="hidden" name="tryAnotherWay" value="on"/>
          <a id="try-another-way" href="javascript:document.forms['kc-select-try-another-way-form'].requestSubmit()" class="dw-btn-secondary">
                ${kcSanitize(msg("doTryAnotherWay"))?no_esc}
          </a>
      </form>
    </#if>

    <#if displayInfo>
      <div id="kc-info" class="dw-info">
          <#nested "info">
      </div>
    </#if>

    <div class="dw-social">
      <#nested "socialProviders">
    </div>
  </div>
</div>

<@loginFooter.content/>
</body>
</html>
</#macro>
