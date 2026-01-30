const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // Keep user1 as is
  const user1 = await prisma.user.create({
    data: {
      firstName: 'Grant',
      lastName: 'Eke',
      email: 'lilgranted0024@gmail.com',
      phone: '+13123456789',
      countryCode: '+1',
      bio: 'Nigerian tech enthusiast in Chicago',
      location: 'Chicago, IL',
      isVerified: true,
      preferences: {
        create: {
          emailNotifications: true,
          pushNotifications: true,
        },
      },
    },
  });

  // Updated user2
  const user2 = await prisma.user.create({
    data: {
      firstName: 'Amaka',
      lastName: 'Okafor',
      email: 'amaka.okafor@example.com',
      phone: '+13126667788',
      countryCode: '+1',
      bio: 'Entrepreneur and cultural advocate',
      location: 'Chicago, IL',
      isVerified: false,
    },
  });

  // Admin user 1
  const adminUser = await prisma.user.upsert({
    where: { email: 'chicagonigerians14@gmail.com' },
    update: {},
    create: {
      firstName: 'Admin',
      lastName: 'User',
      email: 'chicagonigerians14@gmail.com',
      phone: '+13129999999',
      countryCode: '+1',
      bio: 'Platform Administrator',
      location: 'Chicago, IL',
      role: 'admin',
      isVerified: true,
      isActive: true,
      preferences: {
        create: {
          emailNotifications: true,
          pushNotifications: true,
        },
      },
    },
  });

  // Admin user 2
  // const adminUser2 = await prisma.user.upsert({
  //   where: { email: 'godfredobot@gmail.com' },
  //   update: { role: 'admin' },
  //   create: {
  //     firstName: 'Godfred',
  //     lastName: 'Godwin',
  //     email: 'godfredobot@gmail.com',
  //     phone: '+13129999998',
  //     countryCode: '+1',
  //     bio: 'Platform Administrator',
  //     location: 'Chicago, IL',
  //     role: 'admin',
  //     isVerified: true,
  //     isActive: true,
  //     preferences: {
  //       create: {
  //         emailNotifications: true,
  //         pushNotifications: true,
  //       },
  //     },
  //   },
  // });

  const adminUser2 = await prisma.user.upsert({
    where: { email: 'ekegrant59@gmail.com' },
    update: { role: 'admin' },
    create: {
      firstName: 'Grant',
      lastName: 'Eke',
      email: 'ekegrant59@gmail.com',
      phone: '+13122222222',
      countryCode: '+1',
      bio: 'Platform Administrator',
      location: 'Chicago, IL',
      role: 'admin',
      isVerified: true,
      isActive: true,
      preferences: {
        create: {
          emailNotifications: true,
          pushNotifications: true,
        },
      },
    },
  });

  console.log('Admin users:', adminUser2.email);

  // console.log('Created users:', user1.email, user2.email, adminUser.email);

  // Updated listing
  // const listing = await prisma.listing.create({
  //   data: {
  //     title: 'Handwoven Nigerian Basket',
  //     description: 'Beautifully handwoven basket made from local Nigerian fibers',
  //     price: 75.00,
  //     category: 'Home & Decor',
  //     condition: 'new',
  //     images: ['https://via.placeholder.com/450'],
  //     location: 'Chicago, IL',
  //     sellerId: user2.id,
  //   },
  // });

  // console.log('Created listing:', listing.title);

  // Updated event
  // const event = await prisma.event.create({
  //   data: {
  //     title: 'African Cultural Festival',
  //     description: 'Experience African music, dance, and food in Chicago',
  //     category: 'Cultural',
  //     location: 'Chicago, IL',
  //     venue: 'Millennium Park',
  //     startDate: new Date('2025-11-15T12:00:00'),
  //     endDate: new Date('2025-11-15T20:00:00'),
  //     startTime: '12:00',
  //     endTime: '20:00',
  //     isFree: true,
  //     ticketPrice: 0.00,
  //     totalTickets: 500,
  //     availableTickets: 500,
  //     organizerId: user2.id,
  //   },
  // });

  // console.log('Created event:', event.title);

  // // Updated post
  // const post = await prisma.post.create({
  //   data: {
  //     content: 'Looking forward to attending the African Cultural Festival in Chicago! 🌍',
  //     authorId: user2.id,
  //   },
  // });

  // console.log('Created post:', post.id);

  // // Updated group
  // const group = await prisma.group.create({
  //   data: {
  //     name: 'Chicago African Arts Collective',
  //     description: 'A community for artists and enthusiasts of African arts in Chicago',
  //     isPrivate: true,
  //     members: {
  //       create: [
  //         {
  //           userId: user1.id,
  //           role: 'member',
  //         },
  //         {
  //           userId: user2.id,
  //           role: 'admin',
  //         },
  //       ],
  //     },
  //   },
  // });

  // console.log('Created group:', group.name);

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
