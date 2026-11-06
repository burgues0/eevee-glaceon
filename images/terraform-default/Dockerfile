# Floci's native binary is linked against glibc (its base image is RHEL),
# so the final image can't be Alpine/musl (hashicorp/terraform's default
# base) — it has to be a glibc distro. See eevee-glaceon/docs/glaceon.md.
FROM floci/floci:latest AS floci-bin

FROM debian:bookworm-slim AS terraform-bin
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl unzip ca-certificates \
    && curl -fsSL -o /tmp/terraform.zip \
      https://releases.hashicorp.com/terraform/1.9.8/terraform_1.9.8_linux_amd64.zip \
    && unzip /tmp/terraform.zip -d /usr/local/bin \
    && chmod +x /usr/local/bin/terraform

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      bash awscli ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=terraform-bin /usr/local/bin/terraform /usr/local/bin/terraform
COPY --from=floci-bin /app/application /usr/local/bin/floci-aws

WORKDIR /app
COPY eevee-terraform-entrypoint /usr/local/bin/eevee-terraform-entrypoint
COPY trigger.sh /app/trigger.sh
RUN chmod +x /app/trigger.sh /usr/local/bin/eevee-terraform-entrypoint

ENTRYPOINT ["/usr/local/bin/eevee-terraform-entrypoint"]
CMD ["/app/trigger.sh"]
