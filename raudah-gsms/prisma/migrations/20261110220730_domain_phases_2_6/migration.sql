-- CreateEnum
CREATE TYPE "GroupStatus" AS ENUM ('PLANNING', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('M', 'F');

-- CreateEnum
CREATE TYPE "JourneyStatus" AS ENUM ('PRE_TRAVEL', 'ARRIVED', 'IN_MAKKAH', 'IN_MADINAH', 'IN_TRANSIT', 'DEPARTED');

-- CreateEnum
CREATE TYPE "CheckType" AS ENUM ('PAYMENT', 'DOCUMENTS', 'VISA', 'TICKET');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('PENDING', 'CLEARED');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('TICKET', 'VISA', 'PASSPORT_COPY', 'PAYMENT_RECEIPT');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('UPLOADED', 'EXTRACTED', 'NEEDS_REVIEW', 'UNMATCHED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "City" AS ENUM ('MAKKAH', 'MADINAH', 'OTHER');

-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('DOUBLE', 'TRIPLE', 'QUAD', 'OTHER');

-- CreateEnum
CREATE TYPE "TripType" AS ENUM ('ARRIVAL_PICKUP', 'INTERCITY', 'ZIYARAH', 'DEPARTURE_DROPOFF');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "BoardingStatus" AS ENUM ('PENDING', 'BOARDED', 'MISSING', 'STAYED_BEHIND');

-- CreateEnum
CREATE TYPE "HandoverScope" AS ENUM ('PILGRIMS', 'BUS', 'HOTEL');

-- CreateEnum
CREATE TYPE "HandoverStatus" AS ENUM ('SENT', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('IN_APP', 'WHATSAPP');

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "arrivalAirport" TEXT NOT NULL,
    "departureAirport" TEXT NOT NULL,
    "status" "GroupStatus" NOT NULL DEFAULT 'PLANNING',
    "supervisorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupAgent" (
    "groupId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,

    CONSTRAINT "GroupAgent_pkey" PRIMARY KEY ("groupId","agentId")
);

-- CreateTable
CREATE TABLE "Pilgrim" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passportNo" TEXT NOT NULL,
    "passportExpiry" TIMESTAMP(3) NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "gender" "Gender" NOT NULL,
    "phoneNigeria" TEXT NOT NULL,
    "phoneKsa" TEXT,
    "whatsapp" TEXT,
    "specialNeeds" TEXT,
    "emergencyContactName" TEXT NOT NULL,
    "emergencyContactPhone" TEXT NOT NULL,
    "familyLinkId" TEXT,
    "currentResponsibleStaffId" TEXT,
    "journeyStatus" "JourneyStatus" NOT NULL DEFAULT 'PRE_TRAVEL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pilgrim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClearanceCheck" (
    "id" TEXT NOT NULL,
    "pilgrimId" TEXT NOT NULL,
    "type" "CheckType" NOT NULL,
    "status" "CheckStatus" NOT NULL DEFAULT 'PENDING',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "ClearanceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "pilgrimId" TEXT,
    "type" "DocType" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "passengerIndex" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT NOT NULL,
    "extractedJson" JSONB,
    "fieldConfidence" JSONB,
    "warnings" JSONB,
    "status" "DocStatus" NOT NULL DEFAULT 'UPLOADED',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "pilgrimId" TEXT NOT NULL,
    "documentId" TEXT,
    "pnr" TEXT NOT NULL,
    "ticketNo" TEXT NOT NULL,
    "airline" TEXT NOT NULL,
    "outFlightNo" TEXT NOT NULL,
    "outDepartureAirport" TEXT NOT NULL,
    "outDepartureAt" TIMESTAMP(3) NOT NULL,
    "outArrivalAirport" TEXT NOT NULL,
    "outArrivalAt" TIMESTAMP(3) NOT NULL,
    "retFlightNo" TEXT NOT NULL,
    "retDepartureAirport" TEXT NOT NULL,
    "retDepartureAt" TIMESTAMP(3) NOT NULL,
    "retArrivalAirport" TEXT NOT NULL,
    "retArrivalAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visa" (
    "id" TEXT NOT NULL,
    "pilgrimId" TEXT NOT NULL,
    "documentId" TEXT,
    "visaNo" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "permittedStayDays" INTEGER NOT NULL,
    "entryType" TEXT NOT NULL,

    CONSTRAINT "Visa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hotel" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" "City" NOT NULL,
    "address" TEXT,
    "contactPhone" TEXT,

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomNo" TEXT NOT NULL,
    "type" "RoomType" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "gender" "Gender",

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomAssignment" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "pilgrimId" TEXT NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkInById" TEXT,
    "checkOutAt" TIMESTAMP(3),
    "checkOutById" TEXT,

    CONSTRAINT "RoomAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomChangeLog" (
    "id" TEXT NOT NULL,
    "pilgrimId" TEXT NOT NULL,
    "fromRoomId" TEXT,
    "toRoomId" TEXT,
    "byId" TEXT NOT NULL,
    "reason" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportCompany" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,

    CONSTRAINT "TransportCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "type" "TripType" NOT NULL,
    "title" TEXT NOT NULL,
    "fromCity" TEXT,
    "toCity" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "flightNo" TEXT,
    "airport" TEXT,
    "terminal" TEXT,
    "status" "TripStatus" NOT NULL DEFAULT 'PLANNED',
    "delayMinutes" INTEGER,
    "autoKey" TEXT,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripBus" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "transportCompanyId" TEXT NOT NULL,
    "vehiclePlate" TEXT NOT NULL,
    "busNo" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "driverPhone" TEXT NOT NULL,
    "staffInChargeId" TEXT,

    CONSTRAINT "TripBus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripPassenger" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "tripBusId" TEXT NOT NULL,
    "pilgrimId" TEXT NOT NULL,
    "seatNo" TEXT,
    "boardingStatus" "BoardingStatus" NOT NULL DEFAULT 'PENDING',
    "markedById" TEXT,
    "markedAt" TIMESTAMP(3),

    CONSTRAINT "TripPassenger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZiyarahItem" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "city" "City" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "ZiyarahItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Handover" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "fromStaffId" TEXT NOT NULL,
    "toStaffId" TEXT NOT NULL,
    "scope" "HandoverScope" NOT NULL,
    "pilgrimIds" TEXT[],
    "tripBusId" TEXT,
    "hotelId" TEXT,
    "notes" TEXT,
    "issues" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "status" "HandoverStatus" NOT NULL DEFAULT 'SENT',

    CONSTRAINT "Handover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'SENT',

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderRule" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "offsets" JSONB NOT NULL,

    CONSTRAINT "ReminderRule_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "key" TEXT NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Group_code_key" ON "Group"("code");

-- CreateIndex
CREATE INDEX "Group_status_idx" ON "Group"("status");

-- CreateIndex
CREATE INDEX "Pilgrim_passportNo_idx" ON "Pilgrim"("passportNo");

-- CreateIndex
CREATE INDEX "Pilgrim_groupId_idx" ON "Pilgrim"("groupId");

-- CreateIndex
CREATE INDEX "Pilgrim_phoneNigeria_idx" ON "Pilgrim"("phoneNigeria");

-- CreateIndex
CREATE INDEX "Pilgrim_agentId_idx" ON "Pilgrim"("agentId");

-- CreateIndex
CREATE INDEX "Pilgrim_familyLinkId_idx" ON "Pilgrim"("familyLinkId");

-- CreateIndex
CREATE UNIQUE INDEX "Pilgrim_groupId_passportNo_key" ON "Pilgrim"("groupId", "passportNo");

-- CreateIndex
CREATE UNIQUE INDEX "ClearanceCheck_pilgrimId_type_key" ON "ClearanceCheck"("pilgrimId", "type");

-- CreateIndex
CREATE INDEX "Document_groupId_status_idx" ON "Document"("groupId", "status");

-- CreateIndex
CREATE INDEX "Document_pilgrimId_idx" ON "Document"("pilgrimId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_pilgrimId_key" ON "Ticket"("pilgrimId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_documentId_key" ON "Ticket"("documentId");

-- CreateIndex
CREATE INDEX "Ticket_pnr_idx" ON "Ticket"("pnr");

-- CreateIndex
CREATE INDEX "Ticket_ticketNo_idx" ON "Ticket"("ticketNo");

-- CreateIndex
CREATE UNIQUE INDEX "Visa_pilgrimId_key" ON "Visa"("pilgrimId");

-- CreateIndex
CREATE UNIQUE INDEX "Visa_documentId_key" ON "Visa"("documentId");

-- CreateIndex
CREATE INDEX "Visa_visaNo_idx" ON "Visa"("visaNo");

-- CreateIndex
CREATE INDEX "Hotel_groupId_idx" ON "Hotel"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_hotelId_roomNo_key" ON "Room"("hotelId", "roomNo");

-- CreateIndex
CREATE INDEX "RoomAssignment_pilgrimId_idx" ON "RoomAssignment"("pilgrimId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomAssignment_roomId_pilgrimId_key" ON "RoomAssignment"("roomId", "pilgrimId");

-- CreateIndex
CREATE INDEX "RoomChangeLog_pilgrimId_idx" ON "RoomChangeLog"("pilgrimId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportCompany_name_key" ON "TransportCompany"("name");

-- CreateIndex
CREATE INDEX "Trip_groupId_scheduledAt_idx" ON "Trip"("groupId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_groupId_autoKey_key" ON "Trip"("groupId", "autoKey");

-- CreateIndex
CREATE INDEX "TripPassenger_tripBusId_idx" ON "TripPassenger"("tripBusId");

-- CreateIndex
CREATE UNIQUE INDEX "TripPassenger_tripId_pilgrimId_key" ON "TripPassenger"("tripId", "pilgrimId");

-- CreateIndex
CREATE INDEX "ZiyarahItem_groupId_idx" ON "ZiyarahItem"("groupId");

-- CreateIndex
CREATE INDEX "Handover_groupId_idx" ON "Handover"("groupId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAgent" ADD CONSTRAINT "GroupAgent_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAgent" ADD CONSTRAINT "GroupAgent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pilgrim" ADD CONSTRAINT "Pilgrim_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pilgrim" ADD CONSTRAINT "Pilgrim_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClearanceCheck" ADD CONSTRAINT "ClearanceCheck_pilgrimId_fkey" FOREIGN KEY ("pilgrimId") REFERENCES "Pilgrim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_pilgrimId_fkey" FOREIGN KEY ("pilgrimId") REFERENCES "Pilgrim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_pilgrimId_fkey" FOREIGN KEY ("pilgrimId") REFERENCES "Pilgrim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visa" ADD CONSTRAINT "Visa_pilgrimId_fkey" FOREIGN KEY ("pilgrimId") REFERENCES "Pilgrim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visa" ADD CONSTRAINT "Visa_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hotel" ADD CONSTRAINT "Hotel_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAssignment" ADD CONSTRAINT "RoomAssignment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAssignment" ADD CONSTRAINT "RoomAssignment_pilgrimId_fkey" FOREIGN KEY ("pilgrimId") REFERENCES "Pilgrim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripBus" ADD CONSTRAINT "TripBus_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripBus" ADD CONSTRAINT "TripBus_transportCompanyId_fkey" FOREIGN KEY ("transportCompanyId") REFERENCES "TransportCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripPassenger" ADD CONSTRAINT "TripPassenger_tripBusId_fkey" FOREIGN KEY ("tripBusId") REFERENCES "TripBus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripPassenger" ADD CONSTRAINT "TripPassenger_pilgrimId_fkey" FOREIGN KEY ("pilgrimId") REFERENCES "Pilgrim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZiyarahItem" ADD CONSTRAINT "ZiyarahItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZiyarahItem" ADD CONSTRAINT "ZiyarahItem_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
