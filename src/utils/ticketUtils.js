// src/utils/ticketUtils.js
const prisma = require('./prisma');

const generateTicketNumber = async () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `SR-${year}${month}`;

  const lastTicket = await prisma.ticket.findFirst({
    where: { ticketNumber: { startsWith: prefix } },
    orderBy: { ticketNumber: 'desc' },
  });

  const lastSeq = lastTicket
    ? parseInt(lastTicket.ticketNumber.split('-').pop(), 10)
    : 0;

  return `${prefix}-${String(lastSeq + 1).padStart(4, '0')}`;
};

module.exports = { generateTicketNumber };
