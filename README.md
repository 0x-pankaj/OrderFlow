

//user come place their order to our program contract its limit order as amm directly don't support limit order so creating like this 
// our program contract take thier order balance everything 
// emit events 
// our backend event listern take that events and pass to the redis stream 
// our engine and database both consume that events 
// database save it 
// engine consume it and maintain 
// 
// poller service listen balance and passes to the redis queue 

// engine got the price and and on each price check is their any order avaible that match the price 

// if order matches then engine itself or resolver another backend service that got redis stream event to resolve that just call our solana program instruction with all the swap  data instruction from jupiter via jupiter api 
doing in engine itself or making throught another resolver which one suits here 

// after that again event listerner backend listen and figure what what we got swap happen fully or partially 
// update through redis stream 

// then db-manager  update database
 
