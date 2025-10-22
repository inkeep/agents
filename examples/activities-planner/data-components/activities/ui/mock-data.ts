import type { ActivitiesProps } from '../schema';

export const activitiesData: ActivitiesProps = {
  activities: [
    {
      title: 'Summer Music Festival',
      category: 'Festival',
      description:
        'Join us for three days of live music featuring local and international artists across multiple stages. Food vendors, art installations, and family-friendly activities throughout the weekend.',
      details: {
        dates: 'July 15-17, 2024',
        time: '12:00 PM - 11:00 PM',
        location: 'Riverside Park, Downtown',
      },
    },
    {
      title: 'Morning Yoga Sessions',
      category: 'Fitness',
      description:
        'Start your day with energizing outdoor yoga classes suitable for all levels. Bring your own mat and enjoy the sunrise with our certified instructors.',
      details: {
        dates: 'Every Tuesday & Thursday',
        time: '6:30 AM - 7:30 AM',
        location: 'Beachfront Pavilion',
      },
    },
    {
      title: 'Guided Hiking Adventures',
      category: 'Outdoor Activity',
      description:
        'Explore scenic trails with experienced guides who share insights about local flora, fauna, and history. All equipment provided.',
      details: {
        dates: 'Saturdays in June',
        time: '8:00 AM - 2:00 PM',
      },
      subItems: [
        'Mountain Ridge Trail - Moderate difficulty, 5 miles',
        'Waterfall Canyon - Easy, 3 miles with swimming spot',
        'Summit Peak - Challenging, 8 miles with panoramic views',
      ],
    },
    {
      title: 'Artisan Farmers Market',
      category: 'Market',
      description:
        'Browse fresh produce, handmade crafts, baked goods, and specialty items from local vendors. Live music and food trucks every week.',
      details: {
        dates: 'Every Sunday',
        time: '9:00 AM - 2:00 PM',
        location: 'Town Square',
      },
    },
    {
      title: 'Historic District Walking Tour',
      category: 'Tour',
      description:
        "Discover the rich history and architecture of our city's oldest neighborhood. Learn fascinating stories about the people and events that shaped our community.",
      details: {
        dates: 'Daily tours available',
        time: '10:00 AM & 2:00 PM',
        location: 'Starts at Heritage Museum',
      },
      subItems: [
        'Victorian mansions and gardens',
        'Original town hall and courthouse',
        'Historic churches and monuments',
        'Underground tunnels (weather permitting)',
      ],
    },
  ],
};
