export default defineEventHandler(async event => {
  const User = getModel('User')
  const { startTime, endTime } = getQuery(event);
  
  // Convert string timestamps to numbers
  const start = parseInt(startTime);
  const end = parseInt(endTime);
  
  // Validate timestamps
  if (!start || !end || isNaN(start) || isNaN(end)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid startTime or endTime parameters'
    });
  }
  
  // Convert Unix timestamps (seconds) to Date objects
  const startDate = new Date(start * 1000);
  const endDate = new Date(end * 1000);
  
  // Aggregate users by time intervals
  const users = await User.aggregate([
    {
      // Filter users within the date range
      $match: {
        createdAt: {
          $gte: startDate,
          $lte: endDate
        }
      }
    },
    {
      // Group by date and count users
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$createdAt'
          }
        },
        count: { $sum: 1 }
      }
    },
    {
      // Convert date string back to timestamp
      $project: {
        _id: 0,
        timestamp: {
          $toLong: {
            $dateFromString: {
              dateString: '$_id'
            }
          }
        },
        count: 1
      }
    },
    {
      // Sort by timestamp
      $sort: { timestamp: 1 }
    }
  ]);
  
  // Format data as [timestamp, count] pairs expected by the chart
  const chartData = users.map(user => [
    user.timestamp, // timestamp in milliseconds
    user.count      // user count
  ]);
  
  return chartData;
});