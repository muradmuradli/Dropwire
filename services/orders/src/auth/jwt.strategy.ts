import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { passportJwtSecret } from 'jwks-rsa';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface AuthenticatedUser {
  userId: string;
  roles: string[];
}

interface KeycloakJwtPayload {
  sub: string;
  realm_access?: { roles?: string[] };
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const keycloakUrl = config.get<string>('KEYCLOAK_URL');
    const realm = config.get<string>('KEYCLOAK_REALM');
    const issuer = `${keycloakUrl}/realms/${realm}`;

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      issuer,
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${issuer}/protocol/openid-connect/certs`,
      }),
    });
  }

  validate(payload: KeycloakJwtPayload): AuthenticatedUser {
    return {
      userId: payload.sub,
      roles: payload.realm_access?.roles ?? [],
    };
  }
}
