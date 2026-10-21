/** Realistic schema samples, the kind a repository actually contains. */

export const PRISMA_SHOP = `
// Prisma schema for a small shop
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum OrderStatus {
  PENDING
  PAID
  SHIPPED
  CANCELLED
}

model User {
  id         Int       @id @default(autoincrement())
  email      String    @unique @db.VarChar(255)
  firstName  String    @map("first_name")
  lastName   String    @map("last_name")
  phone      String?
  createdAt  DateTime  @default(now()) @map("created_at")
  orders     Order[]
  profile    Profile?

  @@map("users")
}

model Profile {
  id     String @id @default(uuid()) @db.Uuid
  bio    String? @db.Text
  userId Int    @unique @map("user_id")
  user   User   @relation(fields: [userId], references: [id])
}

model Category {
  id       Int       @id @default(autoincrement())
  name     String    @unique
  parentId Int?      @map("parent_id")
  parent   Category? @relation("tree", fields: [parentId], references: [id])
  children Category[] @relation("tree")
  products Product[]
}

model Product {
  id         Int      @id @default(autoincrement())
  sku        String   @unique
  title      String
  priceCents Int      @map("price_cents")
  categoryId Int      @map("category_id")
  category   Category @relation(fields: [categoryId], references: [id])
  items      OrderItem[]
}

model Order {
  id        Int         @id @default(autoincrement())
  userId    Int         @map("user_id")
  user      User        @relation(fields: [userId], references: [id])
  status    OrderStatus @default(PENDING)
  total     Decimal     @db.Decimal(10, 2)
  placedAt  DateTime    @map("placed_at")
  shippedAt DateTime?   @map("shipped_at")
  items     OrderItem[]

  @@map("orders")
}

model OrderItem {
  id        Int     @id @default(autoincrement())
  orderId   Int
  order     Order   @relation(fields: [orderId], references: [id])
  productId Int
  product   Product @relation(fields: [productId], references: [id])
  quantity  Int
  unitPrice Decimal @db.Decimal(10, 2)

  @@unique([orderId, productId])
}
`;

export const SQL_BLOG = `
-- blog schema (PostgreSQL flavoured)
CREATE TYPE post_state AS ENUM ('draft', 'published', 'archived');

CREATE TABLE IF NOT EXISTS authors (
  id SERIAL PRIMARY KEY,
  username VARCHAR(40) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  country_code CHAR(2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE posts (
  id BIGSERIAL PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  slug VARCHAR(120) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT,
  state post_state NOT NULL DEFAULT 'draft',
  views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
  published_at TIMESTAMP NULL,
  UNIQUE (author_id, slug)
);

CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id BIGINT NOT NULL,
  author_id INTEGER,
  body TEXT NOT NULL,
  rating SMALLINT CHECK (rating IN (1, 2, 3, 4, 5)),
  created_at DATETIME NOT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id),
  CONSTRAINT fk_comment_author FOREIGN KEY (author_id) REFERENCES authors (id)
);

ALTER TABLE posts ADD CONSTRAINT fk_posts_author FOREIGN KEY (author_id) REFERENCES authors(id);
`;

export const OPENAPI_PETS = JSON.stringify({
  openapi: "3.0.3",
  info: { title: "Pets", version: "1.0.0" },
  paths: {},
  components: {
    schemas: {
      Owner: {
        type: "object",
        required: ["id", "email", "name"],
        properties: {
          id: { type: "string", format: "uuid", readOnly: true },
          email: { type: "string", format: "email", maxLength: 254 },
          name: { type: "string", maxLength: 80 },
          website: { type: "string", format: "uri" },
          age: { type: "integer", minimum: 18, maximum: 120 },
        },
      },
      Pet: {
        type: "object",
        required: ["id", "name", "species", "owner"],
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          species: { type: "string", enum: ["dog", "cat", "bird"] },
          weightKg: {
            type: "number",
            format: "double",
            minimum: 0.1,
            maximum: 90,
          },
          owner: { $ref: "#/components/schemas/Owner" },
          tags: { type: "array", items: { type: "string" } },
          visits: {
            type: "array",
            items: { $ref: "#/components/schemas/Visit" },
          },
          bornOn: { type: "string", format: "date", nullable: true },
        },
      },
      Visit: {
        type: "object",
        required: ["id", "pet", "at"],
        properties: {
          id: { type: "integer" },
          pet: { $ref: "#/components/schemas/Pet" },
          at: { type: "string", format: "date-time" },
          notes: { type: "string" },
        },
      },
      Error: { type: "object", properties: { message: { type: "string" } } },
    },
  },
});
