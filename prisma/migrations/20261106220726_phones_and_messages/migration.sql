-- CreateTable
CREATE TABLE "phones" (
    "tenant_id" UUID NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "number" VARCHAR(255) NOT NULL,
    "instance_id" VARCHAR(255) NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "client_token" VARCHAR(255) NOT NULL,

    CONSTRAINT "phones_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "direction" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(255) NOT NULL,
    "text" TEXT NOT NULL,
    "external_id" VARCHAR(255),
    "client_id" UUID,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "phones_instance_id_key" ON "phones"("instance_id");

-- CreateIndex
CREATE INDEX "messages_tenant_id_phone_idx" ON "messages"("tenant_id", "phone");

-- AddForeignKey
ALTER TABLE "phones" ADD CONSTRAINT "fk_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "fk_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "fk_client" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
