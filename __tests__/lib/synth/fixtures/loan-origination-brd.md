# Business Requirements Document: Retail Loan Origination

Version 1.3 · Prepared by the Lending Operations team

## 1. Introduction

This document describes the business requirements for the new retail loan
origination platform. It replaces the spreadsheet-based process used by
branch officers today.

## 2. Scope

The platform covers customer onboarding, loan applications, credit checks,
approvals and disbursement. Collections are out of scope.

## 3. Business Requirements

BR-001: The system shall capture the following details for each customer: first name, last name, date of birth, email address, mobile number, annual income and employment status.

BR-002: Each customer can have many loan applications.

BR-003: A loan application belongs to exactly one branch.

BR-004: The requested amount must be between $1,000 and $250,000.

BR-005: The loan term must be at least 6 and no more than 84 months.

BR-006: Application status can be Draft, Submitted, Under Review, Approved, Rejected or Withdrawn.

BR-007: If the application status is Rejected, the rejection reason must be provided.

BR-008: The decision date must be on or after the submitted date.

BR-009: The customer email address must be unique.

BR-010: Application numbers follow the format LN-YYYY-#####.

BR-011: Each loan application can have one or more documents.

BR-012: The system shall respond to searches within 2 seconds.

BR-013: Each branch is managed by a branch manager, who is an employee.

BR-014: An employee reports to another employee.

BR-015: Employment status is one of Salaried, Self-employed, Retired or Unemployed.

Example customer used in workshops: Jane Doe, jane.doe@gmail.com, SSN 123-45-6789.

## 4. Data Dictionary

### 4.1 Branch

| Field | Type | Length | Mandatory | Description |
| --- | --- | --- | --- | --- |
| Branch ID | Number | | Y | Primary key, system generated |
| Branch Code | Alphanumeric | 6 | Y | Unique code, e.g. BLR001 |
| Branch Name | Text | 100 | Y | Display name |
| City | Text | 60 | Y | |
| Region | List | | Y | North, South, East or West |
| Opened On | Date | | N | Date the branch opened |

### 4.2 Document

| Attribute | Data Type | Required | Allowed Values | Notes |
| --- | --- | --- | --- | --- |
| Document Type | Picklist | Yes | ID Proof; Address Proof; Income Proof; Bank Statement | |
| File Name | Varchar(255) | Yes | | |
| Uploaded At | Timestamp | Yes | | |
| Verified | Y/N | No | | Defaults to N |
| Page Count | Integer | No | | Must not exceed 50 |

## 5. Non-functional Requirements

- The platform must be available 99.9% of the time.
- All data must be encrypted at rest.
