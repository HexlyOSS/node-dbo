const { initDbo } = require('./dbo2')


test('', async () => {
  const sqlPath = `${__dirname}/../test`
  const dbo = await initDbo({ 
    sqlPath,
    url: 'postgresql://dbadmin:changeme@localhost:5400/system'
  })

  try {
    const result = await dbo.members.findById({memberId: 1})
    console.log(result)
  }catch(err){
    console.warn(err)
  }

})