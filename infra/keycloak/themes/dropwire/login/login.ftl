<#import "template.ftl" as layout>
<#import "field.ftl" as field>
<#import "buttons.ftl" as buttons>
<#import "social-providers.ftl" as identityProviders>
<#--
  Overrides keycloak.v2's login.ftl for exactly one reason: Keycloak attaches the (deliberately
  generic) "Invalid username or password." message to the USERNAME field when the username
  doesn't exist, but to the PASSWORD field when the username is correct and the password is
  wrong — confirmed by testing both cases directly against the running realm. The displayed TEXT
  never reveals which one was wrong, but the DOM does: the wrong field gets aria-invalid="true"
  and the error icon/outline, which is enough to enumerate valid usernames by inspection alone,
  not just by reading the page. Not fixable with CSS — the structural difference is still there
  underneath. Fix: detect this specific message regardless of which field Keycloak attached it to,
  suppress the per-field attachment on both (via field.ftl's `fieldName` override param, pointing
  it at a key that never has an error), and show one generic banner instead — identical markup no
  matter which credential was actually wrong. Everything else here is unchanged from the original.
-->
<#assign credentialsInvalid = (messagesPerField.get('username')!'') == msg("invalidUserMessage") || (messagesPerField.get('password')!'') == msg("invalidUserMessage")>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username','password') displayInfo=realm.password && realm.registrationAllowed && !registrationDisabled??; section>
<!-- template: login.ftl (dropwire override) -->

    <#if section = "header">
        ${msg("loginAccountTitle")}
    <#elseif section = "form">
        <div id="kc-form">
          <div id="kc-form-wrapper">
            <#if realm.password>
                <form id="kc-form-login" class="${properties.kcFormClass!}" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post" novalidate="novalidate">
                    <#if credentialsInvalid>
                        <div class="dw-alert dw-alert-error">
                            <span class="dw-alert-text">${kcSanitize(msg("invalidUserMessage"))?no_esc}</span>
                        </div>
                    </#if>
                    <#if !usernameHidden??>
                        <#assign label>
                            <#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if>
                        </#assign>
                        <@field.input name="username" label=label autofocus=true autocomplete="username" value=login.username!'' fieldName=(credentialsInvalid)?then("dw-suppressed", "username") />
                    </#if>

                    <@field.password name="password" label=msg("password") forgotPassword=realm.resetPasswordAllowed autofocus=usernameHidden?? autocomplete="current-password" fieldName=(credentialsInvalid)?then("dw-suppressed", "password") />

                    <div class="${properties.kcFormGroupClass!}">
                        <#if realm.rememberMe && !usernameHidden??>
                            <@field.checkbox name="rememberMe" label=msg("rememberMe") value=login.rememberMe?? />
                        </#if>
                    </div>

                    <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>
                    <@buttons.loginButton />
                </form>
            </#if>
            </div>
        </div>
    <#elseif section = "info" >
        <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
            <div id="kc-registration-container" class="${properties.kcLoginFooterBand!}">
                <div id="kc-registration" class="${properties.kcLoginFooterBandItem!}">
                    <span>${msg("noAccount")} <a href="${url.registrationUrl}">${msg("doRegister")}</a></span>
                </div>
            </div>
        </#if>
    <#elseif section = "socialProviders" >
        <#if realm.password && social.providers?? && social.providers?has_content>
            <@identityProviders.show social=social/>
        </#if>
    </#if>

</@layout.registrationLayout>
